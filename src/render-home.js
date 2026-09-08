const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

// Render only stable company metadata. Prices and source times still come from the API.
export function renderHome(source, companies) {
  const template = source.match(/<template id="companyTemplate">([\s\S]*?)<\/template>/);
  if (!template || !source.includes('<!-- COMPANY_CARDS -->')) throw new Error('Missing company template or insertion point');
  const cards = companies.map(company => template[1].replace(/\{\{(id|name|krCode|usTicker|usExchange|ratioLabel)\}\}/g, (_, field) => escapeHtml(company[field]))).join('');
  return source.replace(template[0], '').replace(/<!-- COMPANY_CARDS -->|\{\{companyCount\}\}/g, marker => marker === '<!-- COMPANY_CARDS -->' ? cards : String(companies.length));
}
