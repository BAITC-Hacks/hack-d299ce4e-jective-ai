export const profileFields = {
  full_name: ['Имя и фамилия', 120],
  headline: ['Должность или специализация', 160],
  organization: ['Компания или учебное заведение', 160],
  location: ['Город', 100],
  bio: ['О себе', 2000],
  skills: ['Навыки и интересы', 400],
};
export const socialFields = {
  linkedin: ['LinkedIn', 'linkedin.com'],
  instagram: ['Instagram', 'instagram.com'],
  github: ['GitHub', 'github.com'],
  telegram: ['Telegram', 't.me'],
  website: ['Сайт / портфолио', null],
};
export function safeSocialUrl(value, key) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const domain = socialFields[key]?.[1];
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    if (domain && url.hostname !== domain && url.hostname !== `www.${domain}`) return '';
    return url.href;
  } catch {
    return '';
  }
}
export function validateProfile(values) {
  const clean = {};
  for (const [key, [label, max]] of Object.entries(profileFields)) {
    const value = String(values[key] || '').trim();
    if ((key === 'full_name' && !value) || value.length > max)
      throw new Error(`${label}: от ${key === 'full_name' ? 1 : 0} до ${max} символов.`);
    clean[key] = value;
  }
  clean.social_links = {};
  for (const [key, [label]] of Object.entries(socialFields)) {
    const value = String(values.social_links?.[key] || '').trim();
    if (!value) continue;
    const url = safeSocialUrl(value, key);
    if (!url || url.length > 500)
      throw new Error(`${label}: укажите полную HTTPS-ссылку на профиль (до 500 символов).`);
    clean.social_links[key] = url;
  }
  return clean;
}
const columns =
  'id,full_name,role,headline,organization,location,bio,skills,social_links,avatar_path';
export function createProfilesService(supabase) {
  function client() {
    if (!supabase) throw new Error('Сохранение временно недоступно.');
    return supabase;
  }
  function check(result) {
    if (result.error)
      throw new Error(
        'Не удалось сохранить или загрузить профиль. Проверьте соединение и попробуйте снова.',
      );
    return result.data;
  }
  async function withAvatar(profile) {
    if (!profile?.avatar_path) return profile;
    const result = await client()
      .storage.from('profile-avatars')
      .createSignedUrl(profile.avatar_path, 3600);
    return { ...profile, avatar_url: result.data?.signedUrl || '' };
  }
  return {
    async get(id) {
      const data = check(
        await client().from('profiles').select(columns).eq('id', id).maybeSingle(),
      );
      if (!data) throw new Error('Профиль не найден.');
      return withAvatar(data);
    },
    async list(query = '', page = 0) {
      let request = client().from('profiles').select(columns).order('full_name').order('id');
      const term = query
        .trim()
        .replace(/[%_\\]/g, '')
        .slice(0, 100);
      if (term) request = request.ilike('full_name', `%${term}%`);
      const rows = check(await request.range(page * 24, page * 24 + 23));
      return Promise.all(rows.map(withAvatar));
    },
    async save(id, values) {
      return withAvatar(
        check(
          await client()
            .from('profiles')
            .update(validateProfile(values))
            .eq('id', id)
            .select(columns)
            .single(),
        ),
      );
    },
    async avatar(id, blob, previousPath) {
      const storage = client().storage.from('profile-avatars');
      const path = blob ? `${id}/${crypto.randomUUID()}.jpg` : '';
      if (blob)
        check(await storage.upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
      let profile;
      try {
        profile = check(
          await client()
            .from('profiles')
            .update({ avatar_path: path })
            .eq('id', id)
            .select(columns)
            .single(),
        );
      } catch (error) {
        if (path) await storage.remove([path]);
        throw error;
      }
      if (previousPath) await storage.remove([previousPath]);
      return withAvatar(profile);
    },
  };
}

export async function prepareAvatar(file) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 5 * 1024 * 1024 ||
    !file.size
  )
    throw new Error('Выберите JPG, PNG или WebP размером до 5 МБ.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось обработать фото.'))),
        'image/jpeg',
        0.88,
      ),
    );
  } finally {
    bitmap.close();
  }
}
