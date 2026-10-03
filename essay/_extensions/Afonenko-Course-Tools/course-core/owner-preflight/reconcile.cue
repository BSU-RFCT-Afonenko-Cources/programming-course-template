package ownerpreflight

import (
	"list"
	"strings"
)

// Private attempt transport, not the public Course/Fragment educational schema.
#Attribute: {key: string, value: string}
#Parent: {id: string, classes: [...string], attributes: [...#Attribute]}
#Occurrence: {
	contentJson: string, id: string, classes: [...string], attributes: [...#Attribute], kind: string, ancestors: [...#Parent], order: int & >0
	if kind == "Header" {topLevel: bool, level: int & >=1 & <=6, title: string, titleJson: string}
}
#RawDocument: {navigation?: _, resources?: _, nativeShape: string, readerShape: string, source: string & !="", owner: string & !="", occurrences: [...#Occurrence], assessment: string, assessmentFacts: {enabled: bool, chapterId: string, title: string, headers: [...{id: string, title: string}]}, readerReplay?: {status: "ok", input: string, inputPath: string & !="", inputHash: string & =~"^[a-f0-9]{64}$", ordinaryReader: string, reader: ordinaryReader + "-auto_identifiers", options: _, nativeShape: string, ordinaryShape: string}}
#Document: {#RawDocument, identity?: #RawDocument}
#Transport: {input: {mode: "inventory" | "reconcile", before: [...#Document], after: [...#Document]}}
input: #Transport.input
#Select: {
	document: #Document
	facts: [for x in document.occurrences
		if x.kind == "Div"
		if strings.HasPrefix(x.id, "exr-") || strings.HasPrefix(x.id, "sol-") || list.Contains(x.classes, "solution") || list.Contains(x.classes, "assessment-items") || len([for a in x.attributes if a.key == "course-role" {a}]) > 0 {
			identity: {
				id: x.id, kind: x.kind, classes: x.classes, attributes: x.attributes, ancestors: x.ancestors
				if list.Contains(x.classes, "assessment-items") {members: x.contentJson}
			}
			source: {rootQmd: document.source, owner: document.owner}
			occurrence: x.order
		}]
}

// Existing assessment.collect identity rule, applied to raw native facts.
#AssessmentIdentity: {
	document: #Document
	let f = document.assessmentFacts
	value: {
		if !f.enabled {enabled: false, id: "", title: "", route: "disabled"}
		if f.enabled {
			enabled: true
			if f.chapterId != "" {id: f.chapterId, title: f.title, route: "chapter"}
			if f.chapterId == "" && len(f.headers) > 0 {id: f.headers[0].id, title: f.headers[0].title, route: "header"}
			if f.chapterId == "" && len(f.headers) == 0 {id: "", title: "", route: "absent"}
		}
	}
}
_beforeGroups: [for d in input.before {#Select & {document: d}}]
_afterGroups: [for d in input.after {#Select & {document: d}}]
_before: [for g in _beforeGroups for f in g.facts {f}]
_after: [for g in _afterGroups for f in g.facts {f}]
#Headers: {
	document: #Document
	values: [for x in document.occurrences if x.kind == "Header" {
		id: x.id
		shape: {topLevel: x.topLevel, level: x.level, title: x.title, titleJson: x.titleJson, classes: x.classes, attributes: x.attributes, ancestors: x.ancestors}
	}]
}
#HeaderProof: {
	document: #Document
	let native = document
	source: {rootQmd: native.source, owner: native.owner}
	normal: (#Headers & {document: native}).values
	identity: (#Headers & {document: native.identity}).values
	readerShape:   native.readerShape
	identityShape: native.identity.readerShape
	identitySource: {rootQmd: native.identity.source, owner: native.identity.owner}
	if native.identity.readerReplay == _|_ {replayMatched: true}
	if native.identity.readerReplay != _|_ {
		replayMatched: native.identity.readerReplay.nativeShape == native.nativeShape && native.identity.readerReplay.ordinaryShape == native.nativeShape
	}
}
_beforeHeaderPairs: [for d in input.before {#HeaderProof & {document: d}}]
_afterHeaderPairs: [for d in input.after if d.identity != _|_ {#HeaderProof & {document: d}}]
_headerPairs: list.Concat([_beforeHeaderPairs, _afterHeaderPairs])
_authoredHeaders: [for pair in _beforeHeaderPairs for i, h in pair.identity if h.id != "" {
	topLevel: h.shape.topLevel
	id:       h.id, source:                pair.source, ordinal:          i + 1
	level:    h.shape.level, title:        h.shape.title, titleJson:      h.shape.titleJson
	classes:  h.shape.classes, attributes: h.shape.attributes, ancestors: h.shape.ancestors
}]
report: {
	headers: _authoredHeaders
	diagnostics: [
		for pair in _headerPairs
		if !list.Contains([pair.source], pair.identitySource) || len(pair.normal) != len(pair.identity) ||
			pair.readerShape != pair.identityShape || !pair.replayMatched {
			code: "SOURCE.HEADER_IDENTITY_UNSUPPORTED", severity: "error", phase: "inventory", source: pair.source, id: "", field: "header.identity", related: []
		},
		for pair in _headerPairs if len(pair.normal) == len(pair.identity)
		for i, h in pair.identity
		if !list.Contains([pair.normal[i].shape], h.shape) || h.id != "" && h.id != pair.normal[i].id {
			code: "SOURCE.HEADER_IDENTITY_UNSUPPORTED", severity: "error", phase: "inventory", source: pair.source, id: h.id, field: "header.identity", related: []
		},
		if input.mode == "inventory"
		for i, h in _authoredHeaders for j, other in _authoredHeaders if j > i && h.id == other.id {
			code: "CORE.DUPLICATE_HEADER_ID", severity: "error", phase: "inventory", source: other.source, id: other.id, field: "id", related: [h.source]
		},
		if input.mode == "reconcile"
		for b in input.before for a in input.after if b.source == a.source
		if !list.Contains([(#Headers & {document: b}).values], (#Headers & {document: a}).values) {
			code: "CORE.HEADER_SKELETON_CHANGED", severity: "error", phase: "reconciliation", source: {rootQmd: a.source, owner: a.owner}, id: "", field: "headers", related: [{rootQmd: b.source, owner: b.owner}]
		},
		for i, b in _before for j, c in _before
		if j > i && b.identity.id != "" && b.identity.id == c.identity.id {
			code: "CORE.DUPLICATE_DECLARATION", severity: "error", phase: "inventory", source: c.source, id: c.identity.id, field: "id", related: [b.source]
		},
		if input.mode == "reconcile"
		for a in _after
		let matchingBefore = [for b in _before if a.source.rootQmd == b.source.rootQmd && a.source.owner == b.source.owner && list.Contains([b.identity], a.identity) {b}]
		let matchingAfter = [for b in _after if a.source.rootQmd == b.source.rootQmd && a.source.owner == b.source.owner && list.Contains([b.identity], a.identity) {b}]
		if len(matchingAfter) > len(matchingBefore) {
			code: "CORE.DECLARATION_ADDED_OR_CHANGED", severity: "error", phase: "reconciliation", source: a.source, id: a.identity.id, field: "declaration", related: [for b in _before if b.identity.id == a.identity.id {b.source}]
		},
		if input.mode == "reconcile"
		for b in _before
		let matchingBefore = [for a in _before if a.source.rootQmd == b.source.rootQmd && a.source.owner == b.source.owner && list.Contains([a.identity], b.identity) {a}]
		let matchingAfter = [for a in _after if a.source.rootQmd == b.source.rootQmd && a.source.owner == b.source.owner && list.Contains([a.identity], b.identity) {a}]
		if len(matchingBefore) > len(matchingAfter) {
			code: "CORE.DECLARATION_REMOVED_OR_CHANGED", severity: "error", phase: "reconciliation", source: b.source, id: b.identity.id, field: "declaration", related: []
		},
		if input.mode == "reconcile"
		for b in input.before for a in input.after if b.source == a.source
		let beforeIdentity = (#AssessmentIdentity & {document: b}).value
		let afterIdentity = (#AssessmentIdentity & {document: a}).value
		if beforeIdentity.enabled != afterIdentity.enabled || beforeIdentity.id != afterIdentity.id || beforeIdentity.title != afterIdentity.title || beforeIdentity.route != afterIdentity.route {
			code: "CORE.ASSESSMENT_IDENTITY_CHANGED", severity: "error", phase: "reconciliation", source: {rootQmd: a.source, owner: a.owner}, id: "", field: "assessment.identity", related: [{rootQmd: b.source, owner: b.owner}]
		},
		if input.mode == "reconcile"
		for b in input.before for a in input.after if b.source == a.source && b.assessment != a.assessment {
			code: "CORE.ASSESSMENT_METADATA_CHANGED", severity: "error", phase: "reconciliation", source: {rootQmd: a.source, owner: a.owner}, id: "", field: "assessment", related: [{rootQmd: b.source, owner: b.owner}]
		},
	]
}
