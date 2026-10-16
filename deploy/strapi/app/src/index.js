'use strict';

// Permessi pubblici di sola lettura (find/findOne) sui soli contenuti editoriali.
// Viene eseguito a ogni avvio: nessuna azione di scrittura è mai concessa al ruolo Public.
const READ_ONLY = {
  'api::site-setting.site-setting': ['find'],
  'api::homepage.homepage': ['find'],
  'api::page.page': ['find', 'findOne'],
  'api::news-item.news-item': ['find', 'findOne'],
  'api::sponsor.sponsor': ['find', 'findOne'],
  'api::partner.partner': ['find', 'findOne'],
  'api::gallery.gallery': ['find', 'findOne'],
  'api::faq.faq': ['find', 'findOne'],
};

module.exports = {
  register() {},
  async bootstrap({ strapi }) {
    const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
    if (!role) return;
    const perms = strapi.db.query('plugin::users-permissions.permission');
    const wanted = new Set(Object.entries(READ_ONLY).flatMap(([uid, acts]) => acts.map((a) => `${uid}.${a}`)));
    const existing = await perms.findMany({ where: { role: role.id } });
    for (const p of existing) if (!wanted.has(p.action)) await perms.delete({ where: { id: p.id } });
    const have = new Set(existing.map((p) => p.action));
    for (const action of wanted) if (!have.has(action)) await perms.create({ data: { action, role: role.id } });
  },
};
