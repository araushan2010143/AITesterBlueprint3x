import { APIRequestContext, request } from '@playwright/test';
import { EnvironmentConfig, loadEnvironmentConfig, loadUserCredentials, getCurrentEnv } from './globalConfig';

export class BaseApiTest {
  public requestContext!: APIRequestContext;
  public environment!: EnvironmentConfig;
  protected userCredentials = loadUserCredentials(getCurrentEnv());

  public async init(): Promise<void> {
    this.environment = loadEnvironmentConfig(getCurrentEnv());
    this.requestContext = await request.newContext({
      baseURL: this.environment.baseUrl,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout: this.environment.timeout
    });
  }

  public async cleanup(): Promise<void> {
    await this.requestContext.dispose();
  }
}
