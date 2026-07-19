# Customer notification webhook contract

Password-reset notifications carry an opaque `secret` and the following delivery contract:

```json
{
  "delivery": {
    "path": "/login",
    "credentialLocation": "fragment",
    "fragmentParameter": "resetToken"
  }
}
```

The notification gateway must generate links in the form
`https://<public-origin>/login#resetToken=<URL-encoded-secret>`. It must not put the
secret in a query parameter, request path, analytics event, or log. The storefront
copies the fragment value into memory and immediately removes the fragment from
browser history before rendering the reset form.
