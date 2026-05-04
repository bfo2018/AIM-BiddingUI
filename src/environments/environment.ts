export const environment = {
  production: false,

  /** Maps JavaScript API key (restrict by HTTP referrer in Google Cloud Console). */
  googleMapsApiKey: 'AIzaSyAOCW52DllLhENfn5fpJ2YzROennOh7S2w',

  // Set to false to call real backend OTP APIs.
  useDummyFranchiseAuth: false,

  /** Local-only demo credentials (used when useDummyFranchiseAuth is true). */
  franchiseDemoLogin: {
    aimId: 'AIM1001',
    password: 'demo123',
  },

  // Update these to match your backend.
  // Cloudflare tunnel (active):
  // franchiseApiBaseUrl: 'https://tracker-absence-dress-education.trycloudflare.com/api',
  // adminApiBaseUrl: 'https://tracker-absence-dress-education.trycloudflare.com/api/admin',
  // Local backend (testing):
  franchiseApiBaseUrl: 'http://localhost:3000/api',
  adminApiBaseUrl: 'http://localhost:3000/api/admin',

  /** Local Express API for franchise registration ( User.create /api/users/add ). */
  // Cloudflare tunnel (active):
  // franchiseRegistrationApiUrl: 'https://tracker-absence-dress-education.trycloudflare.com',
  // Local backend (testing):
   franchiseRegistrationApiUrl: 'http://localhost:3000',

  /** Socket.IO server (keep same host as backend APIs in local dev). */
  // Cloudflare tunnel (active):
  // biddingSocketUrl: 'https://tracker-absence-dress-education.trycloudflare.com',
  // Local backend (testing):
  biddingSocketUrl: 'http://localhost:3000',

  razorpayKey: 'rzp_test_ZQGEWarIC5gpPs',
};

