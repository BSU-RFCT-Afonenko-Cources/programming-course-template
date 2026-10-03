local M = {}
local grading = require("./grading")
local pedagogic = require("./pedagogy/contract")
local function has_target(d) return d.attributes.target ~= nil end
local function head(block)
  return {kind = block and block.t or "Missing",
          level = block and block.t == "Header" and block.level or 0,
          title = block and pandoc.utils.stringify(block) or ""}
end
function M.collect(doc)
  local result = pandoc.List()
  doc:walk({Div = function(div)
    if not has_target(div) then return end
    local nested, unknown = 0, pandoc.List()
    for _, child in ipairs(div.content) do
      child:walk({Div = function(d) if has_target(d) then nested = nested + 1 end end})
    end
    for key, _ in pairs(div.attributes) do
      if not pedagogic.exerciseAttributes[key] and not pedagogic.attributes[key] then unknown:insert(key) end
    end
    local body, notes = grading.split(div.content)
    result:insert({id = div.identifier, target = div.attributes.target,
      project = div.attributes.project or "", head = head(div.content[1]),
      bodyJson = body, gradingNotesJson = notes,
      nested = nested, unknownAttributes = unknown})
  end})
  return result
end
return M
