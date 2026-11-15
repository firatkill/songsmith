// Maestro's JS HTTP client runs on the host, not inside the emulator.
var deadline = Date.now() + 15000;
output.otp = '';
while (!output.otp && Date.now() < deadline) {
  var response = http.get(
    'http://localhost:54324/api/v1/search?query=' +
      encodeURIComponent('to:' + output.email),
  );
  if (response.status === 200) {
    var messages = JSON.parse(response.body).messages || [];
    for (var i = 0; i < messages.length; i++) {
      var recipients = messages[i].To || [];
      if (
        !recipients.some(function (recipient) {
          return recipient.Address === output.email;
        })
      )
        continue;
      var message = http.get(
        'http://localhost:54324/api/v1/message/' + messages[i].ID,
      );
      if (message.status !== 200) continue;
      var body = JSON.parse(message.body);
      var match = (body.Text || '').match(/\b\d{6}\b/);
      if (match) {
        output.otp = match[0];
        break;
      }
    }
  }
}
if (!output.otp)
  throw new Error('No OTP email arrived for this test within 15 seconds');
