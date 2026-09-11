from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

OUT = r"C:\Users\user\Desktop\BetIndia-Web-Push-Integration.pdf"
APP_ID = "a396e35e-48d9-4c87-ae4c-f99682f4fd75"

styles = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=styles['Title'], fontSize=20, spaceAfter=6, textColor=colors.HexColor('#0C243D'))
sub = ParagraphStyle('sub', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#5b6478'), spaceAfter=14)
h2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=13, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor('#286FAB'))
body = ParagraphStyle('body', parent=styles['Normal'], fontSize=10.5, leading=15, spaceAfter=6)
bullet = ParagraphStyle('bullet', parent=body, leftIndent=14, bulletIndent=2, spaceAfter=3)
codep = ParagraphStyle('codep', parent=body, fontName='Courier', fontSize=9, leading=13,
                       backColor=colors.HexColor('#f2f4f8'), borderPadding=6, leftIndent=4, spaceBefore=2, spaceAfter=6)
note = ParagraphStyle('note', parent=body, backColor=colors.HexColor('#fff6e5'), borderPadding=8,
                      borderColor=colors.HexColor('#b08d3f'), borderWidth=1)

s = []
def P(t, st=body): s.append(Paragraph(t, st))
def B(t): s.append(Paragraph('&bull;&nbsp;&nbsp;' + t, bullet))
def CP(t): s.append(Paragraph(t, codep))
def gap(h=6): s.append(Spacer(1, h))

P('Web Push Notifications (OneSignal)', h1)
P('Integration requirements for the BetIndia website &amp; app developer', sub)
s.append(HRFlowable(width='100%', color=colors.HexColor('#286FAB'), spaceAfter=10))

P('Purpose', h2)
P('We already send push notifications to the mobile app via OneSignal. We now want the same push '
  'notifications to work in the <b>web browser</b> (desktop &amp; mobile web) for visitors of the website. '
  'This uses the OneSignal Web SDK on the same OneSignal account &mdash; no new backend is needed. Once a '
  'visitor allows notifications, our existing campaigns reach them automatically.')

P('What we need from you (summary)', h2)
B('<b>1.</b> Add the OneSignal Web SDK snippet to the site &lt;head&gt;.')
B('<b>2.</b> Host one service-worker file at the website ROOT.')
B('<b>3.</b> (Optional) call OneSignal.login(userId) after login, to target specific users.')

P('Step 1 &mdash; Add the SDK to the &lt;head&gt;', h2)
P('Place this on every page (global &lt;head&gt; template):')
CP('&lt;script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer&gt;&lt;/script&gt;<br/>'
   '&lt;script&gt;<br/>'
   '&nbsp;&nbsp;window.OneSignalDeferred = window.OneSignalDeferred || [];<br/>'
   '&nbsp;&nbsp;OneSignalDeferred.push(async function(OneSignal) {<br/>'
   '&nbsp;&nbsp;&nbsp;&nbsp;await OneSignal.init({ appId: "' + APP_ID + '" });<br/>'
   '&nbsp;&nbsp;});<br/>'
   '&lt;/script&gt;')

P('Step 2 &mdash; Host the service worker at the ROOT', h2)
P('Create a file named <b>OneSignalSDKWorker.js</b> served at the domain root, i.e. it must be reachable at:')
CP('https://www.betindia.bet/OneSignalSDKWorker.js')
P('...with exactly this content:')
CP('importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js");')
P('<b>Important:</b> the file must be at the site ROOT (not in a subfolder) &mdash; browser push requires the '
  'service worker to be served from the top-level path.', note)

P('Step 3 &mdash; Identify the user (optional but recommended)', h2)
P('So we can send push to a specific player (not just broadcast), call this once after a user logs in, '
  'with the <b>same user ID used in deposit/withdrawal records</b>:')
CP('OneSignal.login("THE_USER_ID");')

P('Where to place it', h2)
B('Website: global &lt;head&gt; template + OneSignalSDKWorker.js at the domain root.')
B('App web view (WebToNative): the mobile app already has native push, so this is only needed for the website / browser users.')
B('OneSignal.login(): wherever your login-success code runs.')

P('Requirements &amp; notes', h2)
B('The site must be served over HTTPS (it already is).')
B('Android Chrome and desktop browsers support web push fully. iOS Safari requires the site be added to the Home Screen.')
B('No API keys are exposed &mdash; the App ID above is safe to use in the browser.')

P('How to test (acceptance)', h2)
B('<b>1.</b> After deploying, open the website in Chrome &mdash; you should see a browser prompt to allow notifications.')
B('<b>2.</b> Click Allow.')
B('<b>3.</b> Tell us &mdash; we will send a test push from OneSignal and confirm it arrives in the browser.')

P('Reference', h2)
B('OneSignal App ID: <font face="Courier">' + APP_ID + '</font>')
B('SDK: OneSignal Web SDK v16 (Typical Site setup)')

gap(10)
s.append(HRFlowable(width='100%', color=colors.HexColor('#d9dee8'), spaceAfter=6))
P('Questions can be directed to the BetIndia operations team. Estimated effort: ~20&ndash;30 minutes.', sub)

SimpleDocTemplate(OUT, pagesize=A4, topMargin=18*mm, bottomMargin=18*mm, leftMargin=18*mm, rightMargin=18*mm,
                  title='BetIndia Web Push Integration').build(s)
print('WROTE', OUT)
