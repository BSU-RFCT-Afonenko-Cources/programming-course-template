local owner_preflight = require("./owner-preflight/filter")
local visibility = require("./visibility")
local grading = require("./grading")
local exercises = require("./exercises")
local assessment = require("./assessment")
local output = require("./output")
local pedagogy = require("./pedagogy/collect")

return {{Pandoc = function(doc)
  if owner_preflight.process(doc,function(body) return visibility.prepare(grading.prepare(body)) end) then
    -- Private capture only: preserve occurrences before projection, no public fragment.
    doc.meta["course-core-processed"] = true
    doc.blocks = pandoc.List()
    return doc
  end
  if not doc.meta.course then return doc end
  output.invalidate()
  assert(doc.meta.course.schema == nil, "Поле course.schema не поддерживается; удалите его из YAML: действует единый текущий контракт")
  doc = grading.prepare(doc)
  doc = visibility.prepare(doc)
  local current = assessment.collect(doc)
  if current then doc.meta["course-assessment-id"] = pandoc.MetaString(current.id) end
  output.write({
    course = {id = pandoc.utils.stringify(doc.meta.course.id),
              view = doc.meta.course.view and pandoc.utils.stringify(doc.meta.course.view) or nil},
    exercises = exercises.collect(doc),
    pedagogy = pedagogy.collect(doc),
    assessment = current
  })
  -- Фильтр представления использует учебные атрибуты только после сохранения.
  -- Маркер документа позволяет обнаружить неверный порядок фильтров.
  doc.meta["course-core-processed"] = true
  return doc
end}}
