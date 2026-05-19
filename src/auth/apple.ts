import {
  appleAuth,
  AppleRequestResponse,
} from '@invertase/react-native-apple-authentication';

export async function signInWithApple(): Promise<AppleRequestResponse> {
  const res = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });
  const state = await appleAuth.getCredentialStateForUser(res.user);
  if (state !== appleAuth.State.AUTHORIZED) {
    throw new Error('apple auth not authorized');
  }
  return res;
}
