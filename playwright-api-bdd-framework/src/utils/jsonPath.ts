export const JsonPathMap = {
  booking: {
    firstname: '$.firstname',
    lastname: '$.lastname',
    totalprice: '$.totalprice',
    depositpaid: '$.depositpaid',
    bookingdates: {
      checkin: '$.bookingdates.checkin',
      checkout: '$.bookingdates.checkout'
    },
    additionalneeds: '$.additionalneeds'
  },
  auth: {
    token: '$.token'
  }
};
