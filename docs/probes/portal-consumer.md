# Установленный управляемый navigation portal

Эта отдельная проверка собирает реальные native children из установленных
Publisher, QRC, Core и Download. Пакеты Core включают целые Presentation и
Navigation. Каждый пакет сначала упакован в локальный архив, установлен через
`quarto add` и сверён по полному набору относительных файлов и SHA-256. Во время
render соседние developer checkout не используются; сетевые imports выключены,
cache каждой попытки новый. Manifest сохраняет реальные версии, provider
commits/trees, dirty state и точные архивные/установленные bytes.

```sh
quarto run tests/probes/portal-consumer.ts \
  --publisher /путь/к/quarto-project-publish \
  --qrc /путь/к/quarto-reference-catalog \
  --core /путь/к/quarto-course \
  --download /путь/к/quarto-project-download \
  --output /путь/к/evidence
```

Native корпус состоит из двух частей: пятичастная композиция с принятым HTML
tasks-owner и отдельный небольшой navigation-only корень с namespaces обычного
шаблона `book`, `lectures`, `practice`, `essay`, `handouts`. Последний получает
настоящую текущую PDF-раздатку; тела этих учебных частей не выдаются за новый
производственный body/owner контракт. Главный portal имеет только навигацию.
Книга небольшой main fixture также запускает настоящий Download producer; его
mutable requests входят в документированный ownership seam и остаются
service/denied. Plain HTML/Reveal части активируют публичный Presentation
descriptor и нативно зарегистрированный Reveal plugin; это не вводит root-owned
exercises. Три самостоятельных dormant native projects классифицирует Core через
inspect; неизвестный root orphan, boundary drift и raw dormant bytes проверяются
отдельно, без ручного списка исключений потребителя.

Core получает именно actual `ctx.portal` текущего Publisher attempt: root input,
private output, исходный audience, дополнительные native selection profiles,
control/hash и реальные member boundaries. Отдельный navigation certificate Core
использует native observations и собственную политику; consumer не вводит
регулярные выражения, AST walker, ручную классификацию ресурсов или fake
namespace. Metadata activates этот handle только для root child. HTML
tasks-owner остаётся отдельным handle с прежним поддержанным контрактом.

QRC сохраняет configured root namespace `site`, собирает actual root и member
targets и разрешает ссылки в обе стороны. Final checks используют окончательные
HTML, общий каталог и native search. Закрытая цель, добавленная после native
render перед QRC, должна остановить публикацию. Core
`sealNavigationPublicationResources` получает current native member output из
actual metadata context и отдельный tasks handle. После QRC сначала завершается
tasks-owner, затем navigation owner: текущие producer service bytes входят в
navigation index до sealing. Его финальный
`validateNavigationPublicationResources` проверяет scoped composition:
разрешённый child resource имеет точные mount/path/SHA из текущего producer
receipt, public runtime требует собственного descriptor/регистрации и actual
native destination. Root/renamed копии service/control/closed bytes отказывают;
общий SHA allowlist отсутствует.

Обязательный Navigation runtime manifest имеет конечную closed-CUE структуру и
канонические сериализованные bytes (JSON является допустимым YAML). Proof
связывает точные source/native/stage bytes и четыре native runtime asset
регистрации. Comments, неизвестные поля, aliases, иной carrier и переименованная
копия не получают разрешение как произвольный YAML/config. Пакет устанавливается
целиком; тестовый Node файл находится вне нативно копируемого plugin directory.

Каждый отказ сравнивает прежние наполненные student и full publications по
полному относительному file-set/SHA и исходные root/member/profile config bytes.
До финализации нет публичных file events. Отдельный test-only вызов
установленного Publisher promotion seam запускает реальные native children и
отказывает stage→public rename после backup; восстановленный выпуск снова
сравнивается полностью. Это fault injection проверки, а не новый авторский
hook/API.

В корне поддержана только доказанная навигация и обычные root-owned public
resources. Педагогические canonical blocks, executable engines и неизвестные
carriers не получают молчаливой поддержки: отрицательные случаи требуют provider
refusal, а engine sentinel подтверждает отсутствие выполнения. Arbitrary root
graders, production pedagogical root owner и полный P2 остаются отдельными
задачами. Принятая resource19 проверка не заменяет эти portal gates.

Default набор содержит 25 native сценариев, включая отдельные
`late-runtime-rename` и `raw-runtime-selection`. `results.json` создаётся только
после полного успешного default набора; `partial-results.json` и отдельные логи
сохраняют место остановки. Для каждой попытки `*-observation.json` записывает
полные previous/current student/full file-set/SHA, config hashes и public file
events до assertions, поэтому первый отказ остаётся проверяемым. Проверка не
имеет skip/resume режима. Фактический статус прогона определяет receipt, а не
наличие этого описания.

Для CI допускается только конечный `--phase composition` (17 сценариев) или
`--phase main-five` (8). Отсутствие `--phase` по-прежнему запускает все 25 в
исходном порядке. Каждая phase создаёт собственную native fixture, запускает
настоящие student/full baseline и затем все зависимые отрицательные сценарии.
Новые snapshots, captures и receipts создаются для каждой попытки; phase не
читает состояние прежнего прогона. Её `phase-results.json` содержит точные
expected labels/count, фактический multiplicity и aggregate сохранность full
выпуска. Это частичный scope проверки, а не полный CI результат.

Обязательный workflow `portal-consumer.yml` запускает обе phases на Quarto
1.10.18 и 1.11.5. Required aggregation принимает только все четыре успешных
jobs/receipts текущего workflow run на одном точном Template head/tree и
закреплённых provider commits/trees из `portal-provider-refs.json`. Все шесть
архивных и фактических `quarto add` file maps должны совпадать между phases и
channels; downloaded archives также сверяются по собственным SHA-256. Aggregator
повторно сравнивает прямые observations: populated seed заменён настоящим
baseline, цепочка previous/current непрерывна, оба выпуска сохранены при
отказах, author config bytes прежние и full baseline неизменен после всей wave.
Полные native logs и успешные final verification events обязательны. Только
после этого создаётся `portal-complete-ci.json`: все 25 labels ровно один раз на
каждом из двух channels. Missing/failed/подменённые evidence не получают полный
результат.

Обе phase имеют бюджет 90 минут. Для одного tasks root подготовка требует
`2 audiences × 2 identity modes = 4` native capture/identity renders, navigation
— ещё 2. Верхняя оценка composition — `17 × 6 = 102` таких renders. Для
отдельной небольшой main-five fixture с одним или двумя HTML owners — 48 или 80;
при наблюдавшихся 25–30 секундах это до 51 и 40 минут только на captures.
Оставшееся время предназначено native children/PDF, QRC, current proofs и
установке инструментов. В обоих её book/essay native inspect выбирает только
собственный `index.qmd`; это самостоятельная fixture, а не сокращённая копия
исходного курса. Исходный Template сохраняет все 4 book и 5 essay inputs, и его
production portal conversion требует отдельного обязательного actual-main gate
на обоих channels. Эти результаты не входят в 25 fixture labels. Это execution
budget, а не результат измерения завершённой phase; изменение frozen corpus
требует повторной оценки перед запуском. Synthetic `portal-receipt-guards.ts`
проверяет fail-closed transport/aggregation и не заменяет native suite.
