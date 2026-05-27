import { APIRequestContext } from '@playwright/test';
import { AuthPage } from './api/authPage';
import { BookingPage } from './api/bookingPage';

export class PageManager {
  public authPage: AuthPage;
  public bookingPage: BookingPage;

  constructor(requestContext: APIRequestContext) {
    this.authPage = new AuthPage(requestContext);
    this.bookingPage = new BookingPage(requestContext);
  }
}
