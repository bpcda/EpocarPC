module.exports = ({ env }) => [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'media-src': ["'self'", 'data:', 'blob:'], upgradeInsecureRequests: null },
      },
    },
  },
  {
    // Solo il sito pubblico può leggere le API dal browser (metodo GET).
    name: 'strapi::cors',
    config: { origin: env.array('CORS_ORIGINS', []), methods: ['GET', 'HEAD', 'OPTIONS'], headers: ['Content-Type', 'Accept'] },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
