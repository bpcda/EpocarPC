module.exports = ({ env }) => ({
  connection: {
    client: env('DATABASE_CLIENT', 'postgres'),
    connection: {
      host: env('DATABASE_HOST'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME'),
      user: env('DATABASE_USERNAME'),
      password: env('DATABASE_PASSWORD'),
      ssl: env.bool('DATABASE_SSL', false) && { rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true) },
    },
    pool: { min: 0, max: env.int('DATABASE_POOL_MAX', 10) },
  },
});
