# ArchStory

**System design, one request at a time.**

Explore real architectures and watch each request travel through them hop by hop. Then build your own answer, check it against a reference, and get it reviewed.

**[Try the live demo →](https://vishbay.github.io/archstory/)**

![A request moving through the URL shortener design in AWS view](docs/screenshot.png)

## Features

- **Explore** 10 designs with step-by-step request flows: URL shortener, news feed, ride hailing, chat, video streaming, checkout, multi-tenant SaaS, autocomplete, rate limiter and notifications.
- **Any cloud**: switch between cloud-neutral names, AWS and GCP, with official icons.
- **Network and zones**: VPCs, subnets and availability-zone failure drills.
- **Practice**: draw your own design, record its flows and get automatic checks against a reference.
- **AI review**: paste a generated prompt into any assistant and see its findings on your design.
- **Bring your own**: import JSON, generate designs with AI, share by link. No backend, no account.

## Quick start

```bash
npm install
npm run dev     # http://localhost:5173
npm test
```

## Add a design

Designs are JSON files in the [`archstory/v1`](public/schema/archstory-v1.json) format: components, connections and request flows. Layout is automatic. Add a file to `src/library/` and run `npm test` to validate it.

## License

[MIT](LICENSE). AWS and Google Cloud icons are downloaded from the providers on first run and are not part of this repository; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). ArchStory is not affiliated with Amazon or Google.
