# Third-party notices

ArchStory's own code and content are MIT licensed (see `LICENSE`). The following are **not** covered by that license.

## Cloud provider icons

ArchStory can show official provider icons in its AWS and GCP views. **The icons are not included in this
repository.** `npm run icons` (run automatically before `dev` and `build` when icons are missing) downloads the
official packages directly from the providers and copies the icons ArchStory uses into `public/icons/`, which is
git-ignored. Each person who runs the script obtains the icons from the provider under the provider's own terms.
If the download fails, the app shows emoji instead.

- **AWS Architecture Icons** © Amazon Web Services, Inc. or its affiliates. Source and terms:
  https://aws.amazon.com/architecture/icons/ (provided for customers and partners to create architecture diagrams).
- **Google Cloud product icons** © Google LLC. Source and terms: https://cloud.google.com/icons
  (may be used to reference Google Cloud products, for example in architecture diagrams).

ArchStory uses the icons only to draw architecture diagrams. A deployed build includes the downloaded icons for that
purpose. Do not re-license them, and remove them from any build that is not an architecture-diagram tool.

## Trademarks

AWS, Amazon Web Services and AWS product names are trademarks of Amazon.com, Inc. or its affiliates. Google Cloud and
Google Cloud product names are trademarks of Google LLC. Other product names (for example Redis, Kafka, Cassandra,
Envoy) belong to their respective owners. They are used only to identify the products they refer to.

**ArchStory is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Amazon,
Google or any other company named here.**

## npm dependencies

Runtime and build dependencies are installed from npm under their own licenses (React, React Flow, Zod, lz-string,
Vite and others). See each package's license in `node_modules` or on npm.
