# EDNS Wrapper

This is a software provides CDN-friendly dns service, it uses dns.google.com as upstream.

## Install

```
git clone https://github.com/ReinForce-II/edns-wrapper.git
cd edns-wrapper
npm install
node[js] app.js [-l <addr>] [-p <port>] [-d <queryhost>] [-t <cachetime(ms)>] [-D]
```

* Default address: 0.0.0.0
* Default Port: 3535
* Default Queryhost: dns.google.com
* Default Cache Time: 600000
* Default No Query Log

## Dependencies

* nodejs
* npm
