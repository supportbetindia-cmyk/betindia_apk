from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

OUT = r"C:\Users\user\Desktop\BetIndia-UTM-Tracking-Integration.pdf"

styles = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=styles['Title'], fontSize=20, spaceAfter=6, textColor=colors.HexColor('#0C243D'))
sub = ParagraphStyle('sub', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#5b6478'), spaceAfter=14)
h2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=13, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor('#286FAB'))
body = ParagraphStyle('body', parent=styles['Normal'], fontSize=10.5, leading=15, spaceAfter=6)
bullet = ParagraphStyle('bullet', parent=body, leftIndent=14, bulletIndent=2, spaceAfter=3)
# Code as a Paragraph (decodes &lt; and wraps long lines), monospace + tinted box.
codep = ParagraphStyle('codep', parent=body, fontName='Courier', fontSize=9.5, leading=14,
                       backColor=colors.HexColor('#f2f4f8'), borderPadding=6, leftIndent=4, spaceBefore=2, spaceAfter=6)
note = ParagraphStyle('note', parent=body, backColor=colors.HexColor('#fff6e5'), borderPadding=8,
                      borderColor=colors.HexColor('#b08d3f'), borderWidth=1)

s = []

def P(t, st=body): s.append(Paragraph(t, st))
def B(t): s.append(Paragraph('&bull;&nbsp;&nbsp;' + t, bullet))
def CP(t): s.append(Paragraph(t, codep))
def gap(h=6): s.append(Spacer(1, h))

P('UTM / Marketing Attribution Tracking', h1)
P('Integration requirements for the BetIndia website &amp; app developer', sub)
s.append(HRFlowable(width='100%', color=colors.HexColor('#286FAB'), spaceAfter=10))

P('Purpose', h2)
P('We want to know which marketing source (WhatsApp, ads, influencers, etc.) brings visitors, and '
  'which sources actually lead to sign-ups and deposits. To do this we need a tiny tracking script '
  'added to the website and the app, plus one function call after a user logs in. This does not change '
  'any existing functionality and adds no noticeable load.')

P('What we need from you (summary)', h2)
B('<b>1.</b> Add one script tag to every page of the website and the app\'s web content.')
B('<b>2.</b> After a user logs in, call one JavaScript function with that user\'s ID.')
P('That is the whole task. Details below.')

P('Step 1 &mdash; Add the tracking script', h2)
P('Place this line in the <b>&lt;head&gt;</b> of the site (and the app\'s web view), so it loads on '
  'every page. It must load as early as possible so the landing-page URL parameters are still present.')
CP('&lt;script src="https://admin.betindia.games/utm.js" async&gt;&lt;/script&gt;')
P('The script automatically reads UTM parameters (utm_source, utm_medium, utm_campaign, utm_term, '
  'utm_content) from the URL, remembers the first-touch and last-touch source, and reports it to our '
  'endpoint. No other configuration is needed.')

P('Step 2 &mdash; Identify the logged-in user (important)', h2)
P('So we can connect a source to a real user (and their deposits), call the function below <b>once, right '
  'after a user logs in or signs up</b>, passing the user\'s ID:')
CP('window.biIdentify(userId);<br/>// example:<br/>// window.biIdentify(window.user.id);')
gap(6)
P('<b>Critical:</b> the value passed to biIdentify() must be the '
  '<b>same user ID that appears in the deposit / withdrawal records</b> (the platform / hurry2 user_id). '
  'If a different id is used, we cannot match the source to deposits.', note)
gap(6)
P('If the site is a single-page app, please also call it again after login state is restored on a '
  'page refresh (i.e. whenever the user becomes known).')

P('Where to place it', h2)
B('Website: in the global &lt;head&gt; template, so it is on all pages.')
B('App (WebToNative / web view): in the same web content head, so the script loads inside the app too.')
B('biIdentify(): wherever your login-success / session-restore code runs.')

P('What the script does (privacy)', h2)
B('Reads only the UTM parameters from the URL and a random anonymous device id it generates.')
B('Sends that (plus the user id you pass to biIdentify) to our endpoint below.')
B('Does NOT read passwords, payment details, or any personal data from the page.')
B('Uses navigator.sendBeacon, so it never blocks or slows down page loading.')

P('How to test (acceptance)', h2)
B('<b>1.</b> Open the site with test parameters:')
CP('https://www.betindia.bet/?utm_source=whatsapp&amp;utm_medium=campaign&amp;utm_campaign=test')
B('<b>2.</b> Log in with a test account.')
B('<b>3.</b> Tell us the test user id &mdash; we will confirm a row appears in our system with '
  'source = "whatsapp" linked to that user. That confirms both steps work.')

P('Endpoints (for your reference)', h2)
B('Script: <font face="Courier">https://admin.betindia.games/utm.js</font>')
B('Data endpoint: <font face="Courier">https://admin.betindia.games/api/track/utm</font> (CORS-enabled, POST)')

gap(12)
s.append(HRFlowable(width='100%', color=colors.HexColor('#d9dee8'), spaceAfter=6))
P('Questions can be directed to the BetIndia operations team. Estimated effort: ~15&ndash;30 minutes.', sub)

SimpleDocTemplate(OUT, pagesize=A4, topMargin=18*mm, bottomMargin=18*mm,
                  leftMargin=18*mm, rightMargin=18*mm,
                  title='BetIndia UTM Tracking Integration').build(s)
print('WROTE', OUT)
