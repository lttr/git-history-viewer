# Azure DevOps PR comment threads -> gv comment format v1
#
# Usage:
#   az repos pr comment-thread list --id <PR> --org <ORG> -p <PROJECT> > raw.json
#   jq --arg ref "PR #<PR>" -f azure-to-gv.jq raw.json > pr.json
#   gv --comments pr.json
#
# Drops system/policy threads, normalizes status, strips the leading "/" from
# file paths, and maps rightFileStart -> "new" side (leftFileStart -> "old").

{
  version: 1,
  source: { kind: "azure-devops", ref: ($ref // "azure-devops") },
  threads: [
    .value[]
    | select(.isDeleted | not)
    | select(any(.comments[]; .commentType == "text"))
    | {
        id: (.id | tostring),
        status: (if .status == "fixed" or .status == "closed" then "resolved" else "open" end),
        anchor: (
          if .threadContext == null then null
          else {
            path: (.threadContext.filePath | sub("^/"; "")),
            side: (if .threadContext.rightFileStart then "new" else "old" end),
            line: ((.threadContext.rightFileStart // .threadContext.leftFileStart).line),
            endLine: ((.threadContext.rightFileEnd // .threadContext.leftFileEnd).line)
          }
          end
        ),
        comments: [ .comments[] | select(.commentType == "text") | {
          author: .author.displayName, date: .publishedDate, body: .content
        } ]
      }
    | select(.comments | length > 0)
  ]
}
