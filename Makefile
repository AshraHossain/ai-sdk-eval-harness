# One entry point for local checks and CI. Offline: no API keys needed.
.PHONY: audit install lint typecheck test coverage eval readme-check selftest calibrate check e2e docker clean

install:
	npm ci

lint:
	npm run lint

typecheck:
	npm run typecheck

test:
	npm test

coverage:
	npm run test:coverage

audit:
	npm audit --omit=dev --audit-level=moderate

selftest:
	npm run eval:selftest

calibrate:
	npm run eval:calibrate

eval:
	npm run eval:gate

# README scorecard tables must match reports/ (regenerate with npm run readme:scorecard)
readme-check:
	npm run readme:scorecard -- --check

# lint + types + tests with the per-file coverage gate + gate self-test + offline eval gate (writes reports/)
# + README scorecard drift check
check: lint typecheck coverage selftest eval readme-check

e2e:
	npm run e2e

docker:
	docker build -t ai-sdk-eval-harness .

clean:
	rm -rf .next coverage reports/*.json reports/summary.md playwright-report test-results
