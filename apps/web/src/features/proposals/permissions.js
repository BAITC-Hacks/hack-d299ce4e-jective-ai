/** Use the verified account profile, never the role selected on the signup form. */
export function canProposeSolution(auth) {
  return (
    auth?.status === 'authenticated' &&
    Boolean(auth.user?.id) &&
    auth.profile?.id === auth.user.id &&
    auth.profile?.role === 'student'
  );
}
