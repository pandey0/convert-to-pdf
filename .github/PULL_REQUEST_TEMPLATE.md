## Description

<!-- Describe what this PR changes and why. Link any related issues, e.g. "Closes #123". -->

## Type of change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactor / chore (no functional changes)

## Testing done

<!-- Describe how you tested this change. e.g.
- Ran `npm run dev` locally and converted a .docx, .xlsx, and .pptx file
- Ran the Docker stack via `make dev` and verified the worker picked up the job
- Verified the admin metrics endpoint still returns expected data
-->

## Checklist

- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] `npm run lint` passes locally
- [ ] `npm run build` succeeds locally
- [ ] I have tested this change locally (dev server and/or Docker)
- [ ] I have updated relevant documentation (README, DOCKER.md, deployment guides) if behavior changed
- [ ] My changes do not introduce new third-party conversion APIs (conversion stays local via LibreOffice, per project design)
