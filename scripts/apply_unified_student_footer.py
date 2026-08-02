from pathlib import Path

path = Path("src/lib/tobyMailingTemplate.ts")
text = path.read_text(encoding="utf-8")

old_constants = 'const NEWSLETTER_JOIN_URL = "https://tobymusic.club/members";'
new_constants = '''const NEWSLETTER_ARCHIVE_URL = "https://tobymusic.club/members?archive=1";
const NEWSLETTER_INVITE_URL = "https://tobymusic.club/members?invite-friend=1";'''
if text.count(old_constants) != 1:
    raise RuntimeError("student footer constants did not match exactly once")
text = text.replace(old_constants, new_constants, 1)

old_block = '''<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;"><tr><td align="center" style="background:${referralBg};border:2px solid ${referralBorder};border-radius:12px;padding:18px 18px 20px;">
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:22px;line-height:1.6;font-weight:700;color:${footerName};margin:0 0 14px;">💌 רוצה לשתף חברה?</p>
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;line-height:1.65;color:${footerText};margin:0 0 16px;">מוזמנת בשמחה לשלוח לה הזמנה להצטרף לתפוצה ✨</p>
<a href="${NEWSLETTER_JOIN_URL}" title="קישור הרשמה לתפוצה של טובי" style="display:inline-block;background:linear-gradient(110deg,#8B2A37,#C9A961,#FFE5A0,#C9A961,#6B1F2A);color:#0F0F12;font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;font-weight:800;line-height:1.2;text-decoration:none;border-radius:9px;padding:14px 24px;">🔗 קישור הרשמה לתפוצה של טובי</a>
</td></tr></table>'''

new_block = '''<!-- TOBY_UNIVERSAL_FOOTER_V2 -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;"><tr><td align="center" style="background:${referralBg};border:2px solid ${referralBorder};border-radius:12px;padding:20px 18px 22px;">
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:24px;line-height:1.5;font-weight:800;color:${footerName};margin:0 0 10px;">📚 רוצה לקבל גם את כל מה שכבר נשלח?</p>
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;line-height:1.65;color:${footerText};margin:0 0 16px;">כל המיילים והחומרים הקודמים מחכים לך בארכיון המנויות.</p>
<a href="${NEWSLETTER_ARCHIVE_URL}" title="כל המיילים והחומרים הקודמים" style="display:inline-block;background:linear-gradient(110deg,#8B2A37,#C9A961,#FFE5A0,#C9A961,#6B1F2A);color:#0F0F12;font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;font-weight:800;line-height:1.2;text-decoration:none;border-radius:9px;padding:15px 26px;">לקבלת כל החומרים הקודמים ←</a>
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:20px;line-height:1.6;font-weight:700;color:${footerName};margin:22px 0 10px;">💌 יש חברה שתשמח להצטרף?</p>
<p style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:18px;line-height:1.6;color:${footerText};margin:0 0 12px;">צרי עבורה קישור הזמנה אישי, חד־פעמי ומאובטח.</p>
<a href="${NEWSLETTER_INVITE_URL}" title="יצירת קישור הזמנה אישי לחברה" style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:19px;font-weight:800;color:${footerSlogan};text-decoration:underline;">יצירת קישור הזמנה אישי לחברה</a>
</td></tr></table>'''

if text.count(old_block) != 1:
    raise RuntimeError("student footer block did not match exactly once")
text = text.replace(old_block, new_block, 1)
path.write_text(text, encoding="utf-8")
print("unified student footer applied")
