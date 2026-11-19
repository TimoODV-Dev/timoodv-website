// Email bodies for the contact form: a plain-text version and a styled HTML version of each.
// SECURITY: every visitor-supplied value is HTML-escaped before it goes anywhere near markup; the only link built
// from visitor input is a mailto: whose address was validated and is URL-encoded. No scripts, no remote images,
// no remote CSS (nothing is fetched when the email is opened, so it cannot track the reader).

export interface Enquiry {
  ref: string;
  name: string;
  email: string;
  organisation?: string;
  eventDate?: string;
  venue?: string;
  message: string;
}

const RED = "#e5232f";
const INK = "#16171b";
const MUTED = "#6b6f78";
const LINE = "#e6e7ea";
const FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const DISPLAY = "Impact, 'Arial Narrow Bold', 'Helvetica Neue', Arial, sans-serif";

export const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const para = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

const rows = (e: Enquiry) => {
  const r: [string, string][] = [["Name", esc(e.name)], ["Email", `<a href="mailto:${encodeURIComponent(e.email).replace(/%40/g, "@")}" style="color:${RED};text-decoration:none;">${esc(e.email)}</a>`]];
  if (e.organisation) r.push(["Organisation", esc(e.organisation)]);
  if (e.eventDate) r.push(["Event date", esc(e.eventDate)]);
  if (e.venue) r.push(["Venue &amp; city", esc(e.venue)]);
  return r;
};

const detailsTable = (e: Enquiry) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
  rows(e).map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};width:130px;font:600 12px ${FONT};letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};vertical-align:top;">${k}</td><td style="padding:10px 0;border-bottom:1px solid ${LINE};font:15px/1.5 ${FONT};color:${INK};vertical-align:top;">${v}</td></tr>`).join("") +
  `</table>`;

const messageBlock = (e: Enquiry) =>
  `<p style="margin:26px 0 8px;font:600 12px ${FONT};letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};">Message</p>` +
  `<div style="border-left:4px solid ${RED};background:#f6f6f8;padding:16px 18px;font:15px/1.65 ${FONT};color:${INK};">${para(e.message)}</div>`;

const shell = (preheader: string, title: string, body: string, footer: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#eceef1;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eceef1;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef1;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#07080b;padding:26px 32px 22px;border-bottom:4px solid ${RED};"><span style="font:28px/1 ${DISPLAY};letter-spacing:1px;color:#ffffff;text-transform:uppercase;">TiMO ODV</span><br><span style="font:11px ${FONT};letter-spacing:2.4px;text-transform:uppercase;color:#9aa0ab;">DJ &nbsp;/&nbsp; Producer</span></td></tr>
<tr><td style="padding:34px 32px 30px;">${body}</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid ${LINE};background:#fafafb;font:12px/1.6 ${FONT};color:${MUTED};">${footer}</td></tr>
</table></td></tr></table></body></html>`;

const refChip = (ref: string) =>
  `<span style="display:inline-block;margin-top:10px;padding:5px 12px;border:1px solid ${LINE};border-radius:20px;font:600 12px ${FONT};letter-spacing:1.6px;color:${INK};">REF &nbsp;${esc(ref)}</span>`;

// ---- Email for the TiMO ODV team ----
export function enquiryEmail(e: Enquiry): { text: string; html: string } {
  const text = [`Reference: ${e.ref}`, `Name: ${e.name}`, `Email: ${e.email}`,
    ...(e.organisation ? [`Organisation: ${e.organisation}`] : []), ...(e.eventDate ? [`Event date: ${e.eventDate}`] : []), ...(e.venue ? [`Venue & city: ${e.venue}`] : []),
    "", e.message, "", "Reply to this email to answer the sender directly."].join("\n");
  const body =
    `<p style="margin:0;font:600 12px ${FONT};letter-spacing:2px;text-transform:uppercase;color:${RED};">New booking enquiry</p>` +
    `<h1 style="margin:8px 0 0;font:34px/1.1 ${DISPLAY};letter-spacing:.5px;text-transform:uppercase;color:${INK};font-weight:400;">${esc(e.name)}</h1>` +
    refChip(e.ref) + `<div style="height:22px;"></div>` + detailsTable(e) + messageBlock(e) +
    `<p style="margin:28px 0 0;"><a href="mailto:${encodeURIComponent(e.email).replace(/%40/g, "@")}?subject=${encodeURIComponent("Re: your enquiry to TiMO ODV [" + e.ref + "]")}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font:700 13px ${FONT};letter-spacing:1.4px;text-transform:uppercase;padding:13px 24px;border-radius:3px;">Reply to ${esc(e.name.split(" ")[0] || "sender")}</a></p>`;
  const html = shell(`New enquiry from ${e.name} (${e.ref})`, `Booking enquiry ${e.ref}`, body,
    `Sent from the TiMO ODV website contact form. Replying to this email goes straight to the sender.`);
  return { text, html };
}

// ---- Copy for the person who sent the enquiry ----
export function copyEmail(e: Enquiry): { text: string; html: string } {
  const text = ["Thanks for contacting TiMO ODV. This is a copy of your enquiry for your records.", `Reference: ${e.ref}`, "",
    `Name: ${e.name}`, `Email: ${e.email}`, ...(e.organisation ? [`Organisation: ${e.organisation}`] : []), ...(e.eventDate ? [`Event date: ${e.eventDate}`] : []), ...(e.venue ? [`Venue & city: ${e.venue}`] : []),
    "", e.message, "", "We will reply to this email address. If you did not send this enquiry, you can ignore this message.", "", "TiMO ODV"].join("\n");
  const body =
    `<p style="margin:0;font:600 12px ${FONT};letter-spacing:2px;text-transform:uppercase;color:${RED};">Enquiry received</p>` +
    `<h1 style="margin:8px 0 0;font:34px/1.1 ${DISPLAY};letter-spacing:.5px;text-transform:uppercase;color:${INK};font-weight:400;">Thanks, ${esc(e.name.split(" ")[0] || "there")}</h1>` +
    `<p style="margin:14px 0 0;font:16px/1.6 ${FONT};color:${INK};">We have your enquiry and will reply to this email address. Here is a copy for your records.</p>` +
    refChip(e.ref) + `<div style="height:24px;"></div>` + detailsTable(e) + messageBlock(e);
  const html = shell(`Your enquiry to TiMO ODV (${e.ref})`, "Your enquiry to TiMO ODV", body,
    `You are receiving this because someone used the contact form on the TiMO ODV website with this email address. If that was not you, you can ignore this message and nothing further will be sent.`);
  return { text, html };
}
