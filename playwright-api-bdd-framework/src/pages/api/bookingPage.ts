import { APIRequestContext, APIResponse } from '@playwright/test';
import { Endpoints } from '../../core/endpoints';
import { BookingPayload } from '../../models/bookingPayload';

export class BookingPage {
  private readonly request: APIRequestContext;

  constructor(requestContext: APIRequestContext) {
    this.request = requestContext;
  }

  public async createBooking(payload: BookingPayload): Promise<APIResponse> {
    return this.request.post(Endpoints.booking, { data: payload });
  }

  public async getBooking(bookingId: number): Promise<APIResponse> {
    return this.request.get(Endpoints.bookingById.replace('{id}', String(bookingId)));
  }

  public async deleteBooking(bookingId: number, token: string): Promise<APIResponse> {
    return this.request.delete(Endpoints.bookingById.replace('{id}', String(bookingId)), {
      headers: {
        Cookie: `token=${token}`
      }
    });
  }

  public async updateBooking(bookingId: number, payload: BookingPayload, token: string): Promise<APIResponse> {
    return this.request.put(Endpoints.bookingById.replace('{id}', String(bookingId)), {
      headers: { Cookie: `token=${token}` },
      data: payload
    });
  }
}
