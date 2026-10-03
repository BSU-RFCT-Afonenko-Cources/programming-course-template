# Исходный пятичастный курс: отдельная native проверка

`actual-main-portal.yml` проверяет product managed portal на Quarto 1.10.18 и
1.11.5. Это отдельный исходный курс: все4 book и5 essay native inputs, остальные
три части, настоящая PDF-раздатка, прежние роли, visibility, archives и QRC/search
links обязательны. Эти три labels на каждом channel не входят в fixture25:
`actual-main-student`, `actual-main-full`, `actual-main-late-current-address`.

CI использует `student-release` и `full-release`: каждая phase запускает один
fresh audience с populated previous publications. Full получает только проверенные
public trees student phase того же run/channel. В `late` новая source/install попытка получает только полностью
проверенные публичные student/full files своего текущего workflow/channel.
Исходники, установленный payload, owners, native captures и permissions всегда
новые. `.project-publish`, `.quarto`, prepared handles, indexes и captures из
baseline не переносятся. Полный archive SHA и оба относительных file-set/SHA maps
сверяются до копирования public bytes.

```sh
ACTUAL_MAIN_RUN_ID=local-current quarto run tests/probes/actual-main-consumer.ts \
  --phase releases \
  --publisher /путь/к/quarto-project-publish \
  --qrc /путь/к/quarto-reference-catalog \
  --core /путь/к/quarto-course \
  --download /путь/к/quarto-project-download \
  --output /путь/к/new-release-evidence
```

`full-release` требует `--baseline` с public-only artifact `student-release`;
`late` — public-only artifact `full-release`. Runner принимает эти три finite
CI phases и local `releases` для полного student→full positive pair. Arbitrary
subset, smoke и resume отсутствуют.
Downstream artifact содержит ровно `publications.tar.gz` и `public-baseline.json`:
SHA/maps, source/install provenance и completed public attempt lineage. Native
logs, prepared handles, owner indexes/hashes, captures, private proofs и caches
остаются отдельным aggregate evidence и не поступают в fresh source job.
Все четыре clean companion refs закреплены в одном `portal-provider-refs.json`.
Все шесть payload archives проходят реальный `quarto add`; полные внешние и15
product установленные копии сверяются, включая3 Core,6 Presentation и2 Navigation.

Тест заменяет только объявленные consumer `.ts` slots `_publication/` в новой
копии, фиксируя source/target SHA. Authored configs и QMD не переписываются ни
runner, ни hook: исходный root и все9 глав сравниваются с точными checkout bytes
до и после каждой попытки. Slot adapters используют те же documented public
Core/Publisher interfaces, actual `ctx.portal`, member boundaries и metadata
outputs. Root остаётся только навигацией, а book/essay получают собственные
current owners. `tests/check.ts` отдельно проверяет реальные product controllers,
оба профиля, оба optional examples, roles/archive assertions и local links;
`tests/external.ts` сохраняет внешний каталог/HTTP gate.

Late fault выполняется обычным configured finalizer после QRC и успешного
child finish, перед navigation finish/current seal: меняются current mounted
bytes `handouts/contracts.pdf`. Требуются конкретный документированный provider
refusal, настоящее изменение SHA, exact lifecycle ordering, новые attempt/index
hashes и сохранность обоих прежних полных public trees без temporary file events.
`actual-main-settings.json` хранит только precise refusal и объявленные slots;
неопределённый код останавливает required gate. Произвольный nonzero не считается
доказательством.

Каждый student-release, full-release и fresh late job имеет budget150 минут;
aggregate5. Standard `pages.yml` сохраняет оба original profiles, оба optional
examples, external imports и все assertions с budget240 минут. Для исходных
Markdown inputs prepare требует16 book +20 essay +2 navigation captures за
попытку,76 за positive pair (budget консервативно40/80). Первый original-course attempt наблюдал интервалы216–224 секунды между
source/identity парами: около110 секунд/render с обязательными current parent
Native audits. Это нижний planning anchor; исправление provider может увеличить
стоимость. Для18 child pairs estimate уже около66 минут/attempt до root
preparation, native members/PDF, QRC/proofs и tools.150 минут — консервативный
budget, который сверяется после завершённого affected positive на финальном pin.
Это оценка бюджета, а не утверждение о native Green.

Aggregation принимает только все шесть успешных phases/jobs текущего run,
exact clean Template head/tree/file map, одинаковые provider/installed maps,
полные native logs и actual metadata JSONL, совпадающие с observations. После
проверки lineage, source bytes, оригинального состава, release continuity,
late refusal и full preservation создаётся отдельный complete receipt с6 labels
на двух channels. Synthetic receipt guards и real archive-transfer guards
проверяют transport; они не заменяют native course proof.

Выбранный текущий exact Core pin `fe576c4eb1d77191b89216ae2e6bbdaef50b28a2`, tree
`6a3a998e3d22907967135daca68991e06801eca0`, содержит 104 файла в каждом whole Core
payload. Root/book/essay устанавливаются полностью; Presentation и Navigation
берутся из того же архивированного commit. Подготовка установленной поставки
сверяет все шесть whole archives через штатный `quarto add` и все 15 product copies
по полному file-set, SHA, bytes и modes. Mandatory CI этого выбранного Core и
actual OriginalCourse native acceptance ещё ожидаются; source/install equality
сама по себе не закрывает эти gates. Изменение `fe576c4` относительно `480f4ef`
выбирает одну render-phase writer convention по frozen native config текущего
профиля: default использует Source, book/website — текущий `outputDirectory`.
Отсутствующий `project.type` сохраняет implicit default; обязательный
нормализованный строковый type здесь не предполагается. Для выбранного pin полный
corpus из 8 native book/default writer cases на обоих channels и обоих profiles
и все 20 current CI jobs пока pending.
Прежние native результаты относятся к своим pins и не закрывают current proof
`fe576c4`. Presentation и Navigation побайтно сохранены. `source-root.json` сохраняет
путь свежей source-копии, exact refs и время начала для пассивного сохранения логов.
Он относится только к native evidence; public-only downstream artifacts его не
содержат и не используют как permission proof. Native Green требует actual run.

Историческая малая native проба: `SOURCE.PUBLICATION_ADDRESS_CHANGED` фактически
получен на Quarto 1.10.18 после
QRC и child finish, до Nav finish/seal, через публичный child current accessor
при изменении mounted `handouts/contracts.pdf`. Малый native checkpoint использовал
точный Core29f payload96, затем восстановил PDF, подтвердил current positive и
завершил обычные Nav finish/seal. Тогдашний Core5eaf менял только CI environment;
все96 Core и пакеты Navigation/Presentation побайтно равны29f. Это наблюдение
accessor, не отрицательный вызов Nav finish и не original 9 late case. Оно относится
к прежнему payload 96 и не доказывает выбранный текущий Core 104. Required
original late CI вызывает реальный Nav finish после этой же мутации и обязан
наблюдать точный code, сохранить оба public trees и показать zero public events.
Generic nonzero не принимается.
