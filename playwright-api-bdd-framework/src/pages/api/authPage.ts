import { APIRequestContext, APIResponse } from '@playwright/test';
import { Endpoints } from '../../core/endpoints';
import { UserCredentials } from '../../core/globalConfig';

export class AuthPage {
  private readonly request: APIRequestContext;

  constructor(requestContext: APIRequestContext) {
    this.request = requestContext;
  }

  public async authenticate(userCredentials: UserCredentials): Promise<APIResponse> {
    return this.request.post(Endpoints.auth, {
      data: {
        username: userCredentials.username,
        password: userCredentials.password
      }
    });
  }

  public async tokenFromResponse(response: APIResponse): Promise<string> {
    const body = await response.json();
    if (!body.token) {
      throw new Error('Authentication response does not contain token');
    }
    return body.token;
  }
}
