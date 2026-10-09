from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle

OUT = r"C:\Users\user\Desktop\BetIndia-Registration-Webhook.pdf"
URL = "https://api.betindia.games/api/v1/webhooks/c1f69df1-2524-47e5-a5b3-ac2e1823a1c5/register?token=SAME_TOKEN"

styles = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=styles['Title'], fontSize=20, spaceAfter=6, textColor=colors.HexColor('#0C243D'))
sub = ParagraphStyle('sub', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#5b6478'), spaceAfter=14)
h2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=13, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor('#286FAB'))
body = ParagraphStyle('body', parent=styles['Normal'], fontSize=10.5, leading=15, spaceAfter=6)
cell = ParagraphStyle('cell', parent=body, fontSize=9.5, leading=12, spaceAfter=0)
bullet = ParagraphStyle('bullet', parent=body, leftIndent=14, bulletIndent=2, spaceAfter=3)
codep = ParagraphStyle('codep', parent=body, fontName='Courier', fontSize=8.5, leading=12,
                       backColor=colors.HexColor('#f2f4f8'), borderPadding=6, leftIndent=4, spaceBefore=2, spaceAfter=6)
note = ParagraphStyle('note', parent=body, backColor=colors.HexColor('#fff6e5'), borderPadding=8,
                      borderColor=colors.HexColor('#b08d3f'), borderWidth=1)

s = []
def P(t, st=body): s.append(Paragraph(t, st))
def B(t): s.append(Paragraph('&bull;&nbsp;&nbsp;' + t, bullet))
def CP(t): s.append(Paragraph(t, codep))
def gap(h=6): s.append(Spacer(1, h))

P('New User Registration Webhook', h1)
P('Integration requirements for Get-ID (platform) developers', sub)
s.append(HRFlowable(width='100%', color=colors.HexColor('#286FAB'), spaceAfter=10))

P('Purpose', h2)
P('You already send us <b>deposit</b>, <b>withdrawal</b> and <b>update</b> webhooks. We also need to know '
  '<b>when a new user registers</b>, so we can count new players per day, see which players registered but '
  'never deposited, and follow up with them. This is one more webhook on the <b>same endpoint and the same '
  'token</b> you already use &mdash; only the last part of the URL changes to <b>/register</b>.')

P('What we need from you (summary)', h2)
B('<b>1.</b> Every time a user completes sign-up, send one HTTPS POST to the URL below.')
B('<b>2.</b> Use the same token you already use for the deposit / withdrawal webhooks.')
B('<b>3.</b> Use the same <b>user_id</b> as in the deposit / withdrawal webhooks.')

P('Endpoint', h2)
CP('POST ' + URL.replace('&', '&amp;'))
P('Content-Type: <b>application/json</b>. Replace <b>SAME_TOKEN</b> with the token already in your '
  'deposit / withdrawal webhook URLs (it can also be sent as the header <b>X-Webhook-Secret</b>).')

P('Fields to send', h2)
rows = [
    ['Field', 'Required?', 'Example', 'Meaning'],
    ['user_id', 'Required', 'c81cc29a6', 'Same ID as in deposit/withdrawal webhooks'],
    ['registered_at', 'Required', '2026-10-09 14:30:00', 'Sign-up date &amp; time, India time (IST)'],
    ['mobile_number', 'Required', '9876543210', "Player's mobile number"],
    ['Branch_id', 'Required', 'ads001', 'Master / branch ID the user belongs to'],
    ['User_name', 'Recommended', 'Rahul Kumar', "Player's name"],
    ['email', 'Optional', 'rahul@example.com', 'Email, if collected'],
]
t = Table([[Paragraph(c, cell) for c in r] for r in rows], colWidths=[28*mm, 24*mm, 38*mm, 74*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0C243D')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#d5dae3')),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f6f7fb')]),
]))
for r in range(1, len(rows)):
    t.setStyle(TableStyle([('TEXTCOLOR', (0, r), (0, r), colors.HexColor('#286FAB'))]))
s.append(t)
gap(8)
P('Field names are the same style as your existing webhooks (<b>user_id</b>, <b>mobile_number</b>, '
  '<b>Branch_id</b>, <b>User_name</b>). <b>registered_at</b> may also be sent as ISO 8601 with offset, e.g. '
  '<b>2026-10-09T14:30:00+05:30</b>. A date without a time zone is read as India time.')

P('Example request body', h2)
CP('{<br/>'
   '&nbsp;&nbsp;"user_id": "c81cc29a6",<br/>'
   '&nbsp;&nbsp;"registered_at": "2026-10-09 14:30:00",<br/>'
   '&nbsp;&nbsp;"mobile_number": "9876543210",<br/>'
   '&nbsp;&nbsp;"Branch_id": "ads001",<br/>'
   '&nbsp;&nbsp;"User_name": "Rahul Kumar",<br/>'
   '&nbsp;&nbsp;"email": "rahul@example.com"<br/>'
   '}')

P('Responses', h2)
B('<b>200</b> &nbsp;<font face="Courier">{"ok": true, "type": "register", ...}</font> &mdash; received.')
B('<b>400</b> &mdash; missing <b>user_id</b> (or bad URL). Please fix and resend.')
B('<b>401</b> &mdash; wrong token.')
P('Sending the same user more than once is safe (retries never create duplicates and never change the '
  'original sign-up date). If you get a timeout or 5xx, please retry.')

P('When to send', h2)
B('Immediately after a user\'s account is created &mdash; one call per new user.')
B('Do <b>not</b> wait for the first deposit; we specifically need users who never deposit.')
B('Past users: no need to resend. We already have them from the user export file.')

P('How to test (acceptance)', h2)
B('<b>1.</b> Register a test account on the site.')
B('<b>2.</b> Tell us the test user_id &mdash; we will confirm it appears under <b>New players</b> for today '
  'with the correct mobile number, branch and time.')

gap(6)
P('<b>Important:</b> the <b>user_id</b> must be exactly the same value you send in deposit / withdrawal '
  'webhooks. Otherwise we cannot connect a registration to that player\'s deposits.', note)
gap(6)
P('Questions can be directed to the BetIndia operations team. Estimated effort: ~30&ndash;60 minutes '
  '(reuses your existing webhook sender).')

SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm,
                  title='BetIndia - New User Registration Webhook').build(s)
print('wrote', OUT)
