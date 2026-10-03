# Шаблон учебного курса

Книга, слайды лекций и практики, исследования, скачиваемые материалы и PDF-раздатка
собираются в один сайт. Шаблон подходит для разных дисциплин; основные примеры
иллюстрируют работу с контрактами. Cloud и PrairieLearn показаны самостоятельными
примерами и не входят в обычную публикацию.

## Запуск

Проверяемые версии: Quarto 1.10.18 и 1.11.5, CUE 0.17.1. Для PDF нужны XeLaTeX и шрифты DejaVu. TypeScript и Lua запускает
Quarto; отдельные Python, Node.js и Deno не требуются. В Linux Debian/Ubuntu зависимости
PDF предоставляет `texlive-xetex texlive-latex-extra texlive-lang-cyrillic texlive-fonts-recommended fonts-lmodern fonts-dejavu`.

```sh
quarto run _extensions/Afonenko-Course-Tools/project-publish/entrypoints/render.ts --profile student
quarto run _extensions/Afonenko-Course-Tools/project-publish/entrypoints/render.ts --profile full
quarto preview --profile student --no-browser --port 4200
quarto run tests/check.ts
```

По умолчанию используется `student`. Результаты находятся в `_site-student/` и
`_site-full/`. Исходники расширений хранятся в Git; во время сборки они не обновляются
и не скачиваются. Курс не зависит от расположения соседних репозиториев.

## Состав

| Каталог | Назначение |
|---|---|
| `book` | Теория, включаемые задания, демонстрация, материалы и критерии |
| `lectures` | Прогноз, обсуждение и раскрытие ответа следующим шагом слайда |
| `practice` | Самопроверка с самостоятельным раскрытием объяснений |
| `essay` | Исследования, вложенные темы, указатели и преподавательский контроль |
| `handouts` | Только PDF: автоматически собирается и размещается в `handouts/` сайта |
| `examples/cloud` | Отдельный пример декларации облачной лабораторной |
| `examples/prairielearn` | Отдельный пример декларации контроля PrairieLearn |
| `fixtures` | Автономный пример внешнего каталога ссылок |
| `tests` | Проверка публикации и покрытия авторского формата других курсов |

## Подключаемые компоненты

| Пакет | Ответственность |
|---|---|
| `course-core` | Учебная модель, профили, связи и проверка CUE |
| `course-presentation` | Отображение учебных элементов и раскрытие ответов |
| `course-navigation` | Управление слайдами Reveal |
| `reference-catalog` | Цели и ссылки внутри публикации и между курсами |
| `project-publish` | Сборка подпроектов и размещение результатов |
| `project-download` | Архивы явно выбранных каталогов |
| `bsu-theme` | Необязательные бренд, стили и ресурсы оформления |

Установка пакета и его активация разделены. Фильтры включаются в `filters`, плагин
навигации — в `revealjs-plugins`, обработчики сборки — в `project.pre-render` и
`project.post-render`. Наличие установленного адаптера не меняет модель: он должен
быть указан в `course.adapters` и подключён как фильтр. В обычном шаблоне адаптеров нет.

Исходные репозитории перечислены в `UPSTREAM.md`. Обновляйте установленные копии
целиком через стандартный `quarto add`, затем проверяйте оба профиля. GitHub-источник
может добавить пространство имён владельца: учитывайте фактический путь пакета
в явных обработчиках и стилях. Поддерживается один текущий контракт; переключателей
версий модели в авторском YAML нет.

## Составной сайт и ссылки

Публикацией управляет корневой `_quarto.yml`:

```yaml
project-publish:
  portal: index.qmd
  output-dir: _site
  projects:
    book: {path: book, format: html}
    lectures: {path: lectures, format: revealjs}
    practice: {path: practice, format: revealjs}
    essay: {path: essay, format: html}
    handouts: {path: handouts, format: pdf, mount: handouts}
  integrations:
    - _publication/prepare.ts
    - _extensions/Afonenko-Course-Tools/reference-catalog/entrypoints/publication.ts
    - _publication/finish.ts
    - _publication/verify.ts
```

Корневой `index.qmd` содержит навигацию на все пять частей; книга размещается в
`book/`. Каждый подпроект сохраняет собственные native границы и поиск. Native
outer output находится в `.project-publish/native`, а выбранный профиль задаёт
публичный каталог через `project-publish.output-dir`. PDF собирается из QMD при каждой сборке; бинарный файл
не хранится в Git и не превращается в HTML. Ссылка из корневой страницы ведёт на
`handouts/contracts.pdf`; из книги — на `../handouts/contracts.pdf`. Навигация
книги и исследований возвращает на корневой `index.html`.

Перед render установленные public Core API готовят navigation-only root и
отдельные текущие book/essay owners. Metadata привязывает каждый handle к его
фактическому native output. После QRC сначала завершаются children и их текущие
resource/address proofs, затем navigation и scoped publication receipt. Последний
configured callback повторно проверяет текущие bytes перед commit. Root не
поддерживает педагогические canonical blocks или executable engines; новые такие
элементы требуют отдельного документированного provider контракта.

При штатном отказе этого managed пути прежние полные student/full publications
сохраняются. Для командной строки используйте показанный `render.ts`: он проверяет
`--profile` и запрещает `--output-dir` до native Quarto. Обычный `quarto render`
по authored config поддержан; произвольные direct native overrides публичного
каталога вне гарантии hooks. Preview использует тот же безопасный путь.

Внутри книги используйте `@sec-contracts`, между подпроектами —
`@book:sec-contracts`, `@lectures:sec-contracts`, `@practice:sec-clamp` и
`@essay:sec-essays`. Цели собираются до разрешения ссылок, поэтому ссылки работают
в обе стороны. Явный список `reference-catalog.exports` определяет публичный каталог.
Это список экспортируемых целей, а не средство сокрытия опубликованной страницы.

`reference-catalog.imports` принимает локальный путь, `file:` или HTTP(S) в `source`.
Источник каталога и `base-url` опубликованного сайта независимы. Пример
`@os:sec-memory` использует локальный JSON, название источника и внешний маркер;
`example.edu` в конфигурации заменяется адресом настоящего курса.

## Учебная разметка

Обычные QMD не зависят от бренда. Смысл блока задают `course-role` и атрибуты,
представление — `course-presentation`, оформление — стандартная тема или БГУ.

```qmd
:::: {#exr-example course-role="prediction" difficulty="introductory" time="2" work-mode="individual"}
## Прогноз

Как изменится результат для совпадающих границ?
::::

::: {#sol-example for="exr-example"}
## Объяснение

Диапазон состоит из одного числа.
:::
```

В режиме `course-presentation.mode: lecture` ответ появляется очередным шагом
слайда, в `study` раскрывается студентом. Время — оценка длительности работы.
Печать раскрывает опубликованные объяснения.

Примеры показывают цели, предварительные знания, материалы, ограничения,
типичную ошибку, вывод, критерии и результат сдачи. `target="manual"` означает
ручное оценивание. Учебный вопрос без `target` остаётся вопросом для обсуждения.
Словарь допустимых ролей и атрибутов поставляет Core в `contract-vocabulary.json`;
шаблон не вводит второй перечень учебных типов.

Исследования используют стандартные `listing`, `categories`, вложенные главы и
`include`. `course-pedagogy.document-defaults: true` передаёт сложность и форму
работы из метаданных документа заданиям; явные атрибуты имеют приоритет.
Примеры стартовых Java-проектов нужны только для демонстрации учебных материалов:
JDK/Gradle не требуются для сборки сайта.

## Профили

Каждый подпроект содержит `_quarto-student.yml` и `_quarto-full.yml`.
Координатор передаёт выбранный профиль всем частям. `.when-full` — короткая запись
штатной условной видимости; `.grading-notes` предназначен для преподавателя.
Фильтрация выполняется до построения учебной модели.

Профиль влияет на публикацию. Исходники и история открытого репозитория остаются
доступными. В студенческий результат не должны попадать закрытые объяснения,
контрольные задания и их архивы; это проверяет `tests/check.ts`.

## Скачивание материалов

Ресурс может существовать без учебного задания:

```yaml
project-download:
  resources:
    observations:
      path: materials/observations
    instructor-project:
      path: projects/example/student
      profiles: [full]
```

```qmd
{{< project-download observations >}}
```

Каталог указан относительно подпроекта. Исходники стартовых проектов выбираются
из `student/`; соседние `reference/` и `tests/` не входят в выбранный каталог.
`profiles: [full]` дополнительно ограничивает доступность архива.
В примерах архивы подключены через отдельный `project-download`; им не требуется
задача PrairieLearn или Cloud. Результаты в `_downloads` не коммитятся.

## Независимые примеры адаптеров

```sh
quarto render examples/cloud --profile full
quarto render examples/prairielearn --profile full
```

Адаптеры определяют и проверяют декларации своей платформы. Компиляторы,
развёртывание инфраструктуры и отправка заданий на платформу не входят в шаблон.
Параметры попыток и зачёта PrairieLearn демонстрируются через
`prairielearn.assessment-defaults`; текст читает те же значения через `meta`.

## Тема БГУ

Тема поставляется репозиторием `BSU-RFCT-Afonenko-Courses/quarto-theme-bsu`.
Файлы `_bsu.yml` явно подключают `_brand.yml` и SCSS для HTML/Reveal.
Чтобы использовать обычный Cosmo, удалите `metadata-files: [_bsu.yml]`.
Учебные блоки, ссылки и навигация сохранят функциональность.
PDF через XeLaTeX использует собственное оформление: CSS на него не действует.
Для полной установки LuaLaTeX предусмотрен отдельный профиль:
`quarto render handouts --profile lualatex`.

## Проверка и публикация

```sh
quarto run tests/check.ts
quarto run tests/external.ts
quarto run tests/features.ts --course /путь/к/Java
```

Первая проверка собирает оба профиля, включая PDF и самостоятельные адаптеры,
проверяет локальные ссылки, скрытые материалы, архивы и режимы показа ответов.
`--skip-render` проверяет уже созданные результаты. Вторая проверяет HTTP-импорт.
Третья извлекает возможности из настоящих примеров и документов другого курса;
новую разметку сначала демонстрируют здесь. Правила инвентаризации собраны
в `tests/feature-contract.ts`, учебные атрибуты читаются из словаря Core.

Отдельные технические пробы не меняют обычный контракт шаблона:
[пять частей и установленная поставка](docs/probes/installed-consumer.md),
[QRC → печатный PDF → ZIP и доверенная политика ресурсов](docs/probes/artifact-consumer.md).
Вторая использует явно выбранные companion-версии Publisher, Print и
экспериментального производителя Core; её fixture не заменяет production Core
resource bridge.

Для GitHub Pages выберите Settings → Pages → GitHub Actions. CI проверяет Quarto
`release` и `pre-release`; после успешной проверки публикуется только студенческий
сайт, собранный стабильным выпуском. PR и плановые проверки ничего не публикуют.
