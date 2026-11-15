// RFC 4122-shaped random suffix; never reused between runs.
output.email =
  'e2e+' +
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  }) +
  '@example.test';
