/* TOBY music mailing template — kept visually aligned with tobymusic.club */

export function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LOGO_WHITE = "https://tobymusic.club/assets/v4/brand/logo-cream.png";
const LOGO_BLACK = "https://tobymusic.club/assets/v4/brand/logo-black.png";
const NEWSLETTER_JOIN_URL = "https://tobymusic.club/members";

export function toLightBody(body: string): string {
  const map: [RegExp, string][] = [
    [/#F8F4EC/gi, "#241A10"],
    [/#F5F1EA/gi, "#241A10"],
    [/#FFE5A0/gi, "#6E4A18"],
    [/#C9A961/gi, "#7A5218"],
    [/#1a1014/gi, "#F2E9D4"],
    [/#0F0F12/gi, "#241A10"],
  ];
  let out = body;
  for (const [re, to] of map) out = out.replace(re, to);
  return out;
}

function upgradeLegacyTypography(body: string): string {
  return body
    .replace(/font-size:19px/gi, "font-size:22px")
    .replace(/font-size:15px/gi, "font-size:20px")
    .replace(/font-size:32px;font-weight:700;color:#FFE5A0;margin:0 0 22px/gi, "font-size:36px;font-weight:700;color:#FFE5A0;margin:0 0 26px")
    .replace(/font-size:24px;font-weight:700;color:#FFE5A0;line-height:1\.6;margin:0 0 22px/gi, "font-size:28px;font-weight:700;color:#FFE5A0;line-height:1.6;margin:0 0 24px")
    .replace(/font-size:21px;font-style:italic;color:#C9A961;margin:0 0 22px/gi, "font-size:26px;font-style:italic;color:#C9A961;margin:0 0 24px")
    .replace(/font-size:18px;border-radius:8px;text-decoration:none/gi, "font-size:21px;border-radius:8px;text-decoration:none");
}

type WrapOpts = { theme?: "dark" | "light" };

export function wrapTobyEmail(subject: string, body: string, opts: WrapOpts = {}): string {
  const light = opts.theme === "light";
  const rawInner = /<[a-z][\s\S]*>/i.test(body) ? body : escHtml(body).replace(/\n/g, "<br>");
  const upgradedInner = upgradeLegacyTypography(rawInner);
  const inner = light ? toLightBody(upgradedInner) : upgradedInner;
  const pageBg = light ? "#E9DFC9" : "#0F0F12";
  const cardBg = light ? "#FBF6EC" : "#0F0F12";
  const headerBg = light ? "#FBF6EC" : "#0F0F12";
  const headerBorder = light ? "#D8C79A" : "#6B1F2A";
  const logo = light ? LOGO_BLACK : LOGO_WHITE;
  const footerName = light ? "#6E4A18" : "#FFE5A0";
  const footerText = light ? "#5C462B" : "#E8D5A4";
  const footerSlogan = light ? "#8B2A37" : "#C9A961";
  const footerFine = light ? "#7A6B55" : "#B8AA97";
  const referralBg = light ? "#F4E8C8" : "#1A1014";
  const referralBorder = light ? "#C69A51" : "#C9A961";

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${pageBg};direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${pageBg};"><tr><td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${cardBg};border-radius:10px;overflow:hidden;">
<tr><td align="center" style="padding:26px 32px 22px;background-color:${headerBg};border-bottom:1px solid ${headerBorder};"><img src="${logo}" alt="TOBY music" width="230" style="width:230px;max-width:72%;height:auto;display:block;margin:0 auto;"></td></tr>
<tr><td id="toby-body" style="padding:34px 36px 8px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:22px;line-height:1.9;color:${light ? "#241A10" : "#F8F4EC"};">${inner}</td></tr>
<tr><td style="padding:18px 32px 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td height="1" style="background:linear-gradient(110deg,#6B1F2A,#C9A961,#FFE5A0,#C9A961,#6B1F2A);font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:24px 32px 30px;text-align:center;">
<p style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:${footerName};margin:0 0 10px;">טובי וינברג</p>
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;color:${footerText};margin:0 0 9px;line-height:1.65;">קלידנית · חלילנית · מנהלת תזמורת · הוראת פסנתר וחליל צד</p>
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;color:${footerText};margin:0 0 12px;">050-412-4161</p>
<p style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-style:italic;color:${footerSlogan};margin:0 0 20px;">"אומנות ואמינות, זו יצירה"</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;"><tr><td align="center" style="background:${referralBg};border:2px solid ${referralBorder};border-radius:12px;padding:18px 18px 20px;">
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:22px;line-height:1.6;font-weight:700;color:${footerName};margin:0 0 14px;">💌 רוצה לשתף חברה?</p>
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;line-height:1.65;color:${footerText};margin:0 0 16px;">מוזמנת בשמחה לשלוח לה הזמנה להצטרף לתפוצה ✨</p>
<a href="${NEWSLETTER_JOIN_URL}" title="קישור הרשמה לתפוצה של טובי" style="display:inline-block;background:linear-gradient(110deg,#8B2A37,#C9A961,#FFE5A0,#C9A961,#6B1F2A);color:#0F0F12;font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;font-weight:800;line-height:1.2;text-decoration:none;border-radius:9px;padding:14px 24px;">🔗 קישור הרשמה לתפוצה של טובי</a>
</td></tr></table>
<p style="font-family:Arial,sans-serif;font-size:20px;color:${footerFine};margin:0;line-height:1.65;">תפוצת התלמידות של TOBY music</p>
</td></tr></table></td></tr></table></body></html>`;
}

export const TOBY_EMAIL_BLOCKS = [
  { id: "h1", label: "כותרת ראשית", html: `<p style="font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:700;color:#FFE5A0;margin:0 0 26px;line-height:1.3;text-align:center;">כותרת ראשית ✨</p>` },
  { id: "sub", label: "כותרת משנה", html: `<p style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-style:italic;color:#C9A961;margin:0 0 24px;line-height:1.6;text-align:center;">כותרת משנה 🎵</p>` },
  { id: "lead", label: "משפט פתיחה מודגש", html: `<p style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#FFE5A0;line-height:1.6;margin:0 0 24px;text-align:center;">משפט פתיחה מודגש 💫</p>` },
  { id: "body", label: "פסקת גוף", html: `<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:22px;color:#F8F4EC;line-height:1.95;margin:0 0 24px;text-align:center;">שורה ראשונה<br>שורה שנייה<br>שורה שלישית</p>` },
  { id: "box", label: "תיבת הדגשה", html: `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background-color:#1a1014;border-right:4px solid #C9A961;border-radius:0 6px 6px 0;padding:20px 22px;"><p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:22px;color:#FFE5A0;line-height:1.9;margin:0;text-align:center;">✨ תוכן התיבה</p></td></tr></table>` },
  { id: "note", label: "הערת שוליים", html: `<p style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-style:italic;color:#C9A961;line-height:1.9;margin:0 0 16px;text-align:center;">*הערת שוליים</p>` },
  { id: "img", label: "תמונה", html: `<img src="https://" alt="" width="536" style="max-width:100%;height:auto;display:block;margin:0 auto 24px;border-radius:8px;">` },
] as const;

export const TOBY_EMOJIS = ["✨","🎵","🎶","🎹","🎼","🎻","🎤","🌟","💫","⭐","💛","🧡","❤️","🔥","🙌","👏","🎉","🎊","😊","😍","🥰","😅","🤩","😇","🙏","💌","📩","📣","🎯","🌸","🌺","👑","💎","🕊️"];
