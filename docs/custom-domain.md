# Moving the site to a custom domain

The site is already live on GitHub Pages (see the README). This guide moves it to your own domain.

The domain comes from **Cloudflare Registrar** (about €10–15 a year, sold at cost, WHOIS privacy included).

Expect about 30 minutes of work, plus some waiting for DNS.

## What you need

- A Cloudflare account and a payment card
- Your GitHub account (`renato555`)
- A domain name you've chosen

## 1. Buy the domain

1. Create an account at **dash.cloudflare.com**.
2. Go to **Domain Registration → Register Domains** and search. Ideas:
   - `renatojurisic.com`: the safest choice and easiest to say out loud
   - `jurisic.dev`: short and reads as "developer". It only works over HTTPS, which GitHub Pages provides anyway.
   - Cloudflare doesn't sell `.hr`. That needs a Croatian registrar through CARNET and more paperwork.
3. Pay and turn on **auto-renew**. A lapsed domain can be bought by someone else.

## 2. Verify the domain with GitHub

This stops anyone else from pointing a GitHub site at your domain.

1. Click your GitHub avatar, then go to **Settings → Pages → Add a domain** and enter your domain.
2. GitHub shows a **TXT record**. Its name looks like `_github-pages-challenge-renato555` and it has a random value.
3. In Cloudflare, go to **your domain → DNS → Records** and add that TXT record.
4. Back on GitHub, click **Verify**.

## 3. Point the domain at GitHub

In Cloudflare, go to **DNS → Records** and add the records below. Set every one to **DNS only (grey cloud)**, not *Proxied*, or GitHub can't issue the HTTPS certificate.

| Type  | Name  | Content                |
|-------|-------|------------------------|
| A     | `@`   | `185.199.108.153`      |
| A     | `@`   | `185.199.109.153`      |
| A     | `@`   | `185.199.110.153`      |
| A     | `@`   | `185.199.111.153`      |
| AAAA  | `@`   | `2606:50c0:8000::153`  |
| AAAA  | `@`   | `2606:50c0:8001::153`  |
| AAAA  | `@`   | `2606:50c0:8002::153`  |
| AAAA  | `@`   | `2606:50c0:8003::153`  |
| CNAME | `www` | `renato555.github.io`  |

The A and AAAA records point the bare domain at GitHub's servers. The CNAME record makes `www.` work too.

## 4. Connect the domain to the repository

1. In the repository, go to **Settings → Pages → Custom domain**, enter `yourdomain.com` and save. GitHub adds a `CNAME` file to the repository, so run `git pull` before your next push.
2. Wait for the DNS check to go green. That's usually a few minutes but can take a few hours.
3. Tick **Enforce HTTPS**. The certificate usually arrives within an hour; GitHub says it can take up to 24 hours.
4. Point the link previews at the new domain. The `og:image` tags on every page use `https://renato555.github.io/rjurisic-website`, which GitHub redirects to your domain, but the direct address is more reliable for LinkedIn and Slack:

   ```bash
   sed -i 's|https://renato555.github.io/rjurisic-website|https://yourdomain.com|' *.html
   ```

## 5. Check it works

- `https://yourdomain.com` loads the site
- `https://www.yourdomain.com` redirects to it
- After that, every push to `main` updates the site within a minute or two

## Troubleshooting

- **"DNS check unsuccessful":** wait longer, and check that the records are set to *DNS only*, not *Proxied*.
- **The HTTPS checkbox is greyed out:** the certificate is still being issued. Wait, or remove the custom domain and add it again to retry.
- **404 at the domain:** check that Pages is set to deploy from `main` and `/ (root)`, and that `index.html` is in the root of the repository.
