module.exports = () => ({
  upload: { config: { sizeLimit: 10 * 1024 * 1024, breakpoints: { large: 1600, medium: 1000, small: 600 } } },
  // Nessuna registrazione pubblica di utenti finali: l'autenticazione del sito resta su Supabase.
  'users-permissions': { config: { register: { allowedFields: [] } } },
});
