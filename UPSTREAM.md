# Источники установленных расширений

Каталоги `_extensions` хранятся в Git и используются непосредственно при сборке.
Установка не включает пакет: фильтры, обработчики и тема подключаются явно в YAML.
При обновлении меняют целую установленную копию и проверяют оба профиля.

| Пакеты | Исходный репозиторий | Коммит происхождения установленной копии |
|---|---|---|
| `course-core` (root/book/essay), `course-navigation` (lectures/practice) | [Afonenko-Course-Tools/quarto-course](https://github.com/Afonenko-Course-Tools/quarto-course) | [fe576c4eb1d77191b89216ae2e6bbdaef50b28a2](https://github.com/Afonenko-Course-Tools/quarto-course/tree/fe576c4eb1d77191b89216ae2e6bbdaef50b28a2) |
| `course-presentation` (book/essay/lectures/practice/examples/cloud/examples/prairielearn) | [Afonenko-Course-Tools/quarto-course](https://github.com/Afonenko-Course-Tools/quarto-course) | [fe576c4eb1d77191b89216ae2e6bbdaef50b28a2](https://github.com/Afonenko-Course-Tools/quarto-course/tree/fe576c4eb1d77191b89216ae2e6bbdaef50b28a2) |
| `reference-catalog` | [Afonenko-Course-Tools/quarto-reference-catalog](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog) | [9a4bf6aafd73aff0daf51ae208247f3f194057c2](https://github.com/Afonenko-Course-Tools/quarto-reference-catalog/tree/9a4bf6aafd73aff0daf51ae208247f3f194057c2) |
| `project-publish` | [Afonenko-Course-Tools/quarto-project-publish](https://github.com/Afonenko-Course-Tools/quarto-project-publish) | [ae6b5320f99afba1b6adada654ead7978d8a8dab](https://github.com/Afonenko-Course-Tools/quarto-project-publish/tree/ae6b5320f99afba1b6adada654ead7978d8a8dab) |
| `project-download` | [Afonenko-Course-Tools/quarto-project-download](https://github.com/Afonenko-Course-Tools/quarto-project-download) | [d78a533b14c38e3dd64dbfbd59e437a82e2752fd](https://github.com/Afonenko-Course-Tools/quarto-project-download/tree/d78a533b14c38e3dd64dbfbd59e437a82e2752fd) |
| `bsu-theme` | [BSU-RFCT-Afonenko-Courses/quarto-theme-bsu](https://github.com/BSU-RFCT-Afonenko-Courses/quarto-theme-bsu) | [176701f68e32c6424c67ca00a31deb15aeca6818](https://github.com/BSU-RFCT-Afonenko-Courses/quarto-theme-bsu/tree/176701f68e32c6424c67ca00a31deb15aeca6818) |
| `course-prairielearn` | [Afonenko-Course-Tools/quarto-course-prairielearn](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn) | [95c6718640210b654c1f332bd8ba48effa1a92a6](https://github.com/Afonenko-Course-Tools/quarto-course-prairielearn/tree/95c6718640210b654c1f332bd8ba48effa1a92a6) |
| `course-cloud` | [Afonenko-Course-Tools/quarto-course-cloud](https://github.com/Afonenko-Course-Tools/quarto-course-cloud) | [5ff8d85762f428e24a20b1a5a5d295c7b2ec8c01](https://github.com/Afonenko-Course-Tools/quarto-course-cloud/tree/5ff8d85762f428e24a20b1a5a5d295c7b2ec8c01) |

Cloud и PrairieLearn установлены только в самостоятельных `examples/`.
Обычная публикация не подключает их и не требует учебной платформы.

Точный portal provider set закреплён в
[`tests/probes/portal-provider-refs.json`](tests/probes/portal-provider-refs.json).
Для текущей подготовки Core tree — `6a3a998e3d22907967135daca68991e06801eca0`,
Publisher tree — `22e97a507062072066092d3f838b3fe50063424f`; QRC и Download
сохраняют указанные commits и exact trees из того же контракта. Все шесть whole
payloads установлены через штатный local `quarto add`, затем полностью перенесены
в 15 product copies с проверкой file-set/SHA/bytes/modes и bundled license files.
Это provenance установленной подготовки. Mandatory CI выбранного Core и
OriginalCourse native acceptance ещё ожидаются; эта ведомость не объявляет Core
принятым и не заменяет required native gates.

Core `fe576c4` сохраняет одну writer convention frozen native config: implicit
default использует Source, book/website — текущий output directory. Полный corpus
из 8 native book/default writer cases и все 20 current CI jobs этого pin пока
pending. Они должны отдельно подтвердить выбранную native convention;
прежние native результаты не переносятся в его acceptance. Здесь фиксируется
только подготовка установленных bytes.

Указанный Core pin относится только к root/book/essay из
[`ACTUAL_MAIN_INSTALLATIONS`](tests/probes/actual-main-contract.ts). Четыре другие
Core copies в lectures/practice/examples/cloud/examples/prairielearn находятся
вне этого install contract и сохраняют прежнюю поставку. Оставшаяся нормализация
consumer/API/pins относится к последующему Task5; acceptance единой composition
текущей подготовкой не подтверждён.

Сведения о коммитах фиксируют происхождение этой поставки, а не поддерживаемые
варианты схем. Учебная модель имеет один текущий контракт. Изменения реализации
вносятся в указанные исходные репозитории. При установке через `quarto add`
учитывайте возможное пространство имён владельца в пути пакета.
