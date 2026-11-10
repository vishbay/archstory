# ArchStory

**System design, one request at a time.**

Explore real architectures and watch each request travel through them hop by hop. Then build your own answer, check it against a reference, and get it reviewed.

**[Try the live demo →](https://vishbay.github.io/archstory/)**

![A request moving through the URL shortener design in AWS view](docs/screenshot.png)

## Features

- **Explore** 10 designs with step-by-step request flows: URL shortener, news feed, ride hailing, chat, video streaming, checkout, multi-tenant SaaS, autocomplete, rate limiter and notifications.
- **Any cloud**: switch between cloud-neutral names, AWS and GCP, with official icons.
- **Network and zones**: VPCs, subnets and availability-zone failure drills.
- **Monitoring**: SLOs with error budgets, alerts (page or ticket), what to watch on each component and how to debug it, plus a telemetry layer you can switch on.
- **Practice**: draw your own design, record its flows and get automatic checks against a reference.
- **Review with your own AI**: ArchStory writes the prompt and its findings appear on your design. Paste it into any assistant, or optionally connect your own API key (Anthropic, OpenAI, Gemini, or a local server such as Ollama) to send it from the app.
- **Bring your own**: import JSON, build designs with your own AI, share by link. No AI or server of its own, no account. An API key stays in your browser and goes only to the provider you pick.

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
