"""One-off script: expands the v1.0_dev/val/test evaluation splits with new
cases, following the exact schema and construction pattern of the existing
50 cases.

Ground truth for every new case is correct BY CONSTRUCTION, not by
subjective judgment:
- SUPPORTED cases restate the evidence/tool result without adding anything.
- CONTRADICTED/GROUNDING_CONTRADICTION cases assert something the evidence
  text does not say (a different fact, a fabricated citation/number).
- CONTRADICTED/TOOL_COUNT_MISMATCH cases claim a tool result count that
  differs from tool_records.
- CONTRADICTED/TOOL_EXECUTION_FAILURE_CLAIM cases claim success when
  tool_records show status="error".

This is NOT a substitute for the original 50 cases' two-independent-annotator
process (documented in HUMAN_ANNOTATION_REPORT.md) -- it's a deterministic
construction method, and is labeled as such in that report rather than
being folded into the human-annotation Cohen's Kappa numbers.

Evidence statements use real, checkable facts (published ML papers, standard
sysadmin/networking behavior, elementary statistics) so nothing fabricated
is introduced into the dataset as if it were true.
"""

from __future__ import annotations

import json
from pathlib import Path

DATASETS_DIR = Path(__file__).parent.parent / "datasets"

NEW_CASES = [
    # ── research (grounding contradiction / supported) ──
    {
        "domain": "research", "supported": True,
        "input_query": "What did Devlin et al. (2019) introduce BERT for?",
        "evidence": "Devlin et al. (2019) introduced BERT, a bidirectional transformer pretrained with a masked language modeling objective.",
        "agent_claim": "BERT, introduced by Devlin et al. (2019), is a bidirectional transformer pretrained using masked language modeling.",
    },
    {
        "domain": "research", "supported": False,
        "input_query": "What did Devlin et al. (2019) introduce BERT for?",
        "evidence": "Devlin et al. (2019) introduced BERT, a bidirectional transformer pretrained with a masked language modeling objective.",
        "agent_claim": "Devlin et al. (2019) introduced BERT as a unidirectional autoregressive model trained purely on next-token prediction.",
    },
    {
        "domain": "research", "supported": True,
        "input_query": "What optimizer did the original Adam paper propose?",
        "evidence": "Kingma and Ba (2015) proposed Adam, an optimizer combining momentum and adaptive per-parameter learning rates.",
        "agent_claim": "Adam, proposed by Kingma and Ba (2015), combines momentum with adaptive per-parameter learning rates.",
    },
    {
        "domain": "research", "supported": False,
        "input_query": "What optimizer did the original Adam paper propose?",
        "evidence": "Kingma and Ba (2015) proposed Adam, an optimizer combining momentum and adaptive per-parameter learning rates.",
        "agent_claim": "The Adam optimizer was introduced by LeCun et al. in 1998 and uses a fixed global learning rate with no momentum term.",
    },
    {
        "domain": "research", "supported": True,
        "input_query": "What does the ResNet architecture introduce?",
        "evidence": "He et al. (2016) introduced residual connections, allowing gradients to skip layers directly via identity mappings.",
        "agent_claim": "ResNet, from He et al. (2016), introduces residual/skip connections using identity mappings between layers.",
    },
    {
        "domain": "research", "supported": False,
        "input_query": "What does the ResNet architecture introduce?",
        "evidence": "He et al. (2016) introduced residual connections, allowing gradients to skip layers directly via identity mappings.",
        "agent_claim": "ResNet was proposed by Vaswani et al. (2017) and eliminates all skip connections in favor of dense attention layers.",
    },
    {
        "domain": "research", "supported": True,
        "input_query": "What does dropout regularization do during training?",
        "evidence": "Srivastava et al. (2014) showed dropout randomly zeroes a fraction of unit activations during training to reduce overfitting.",
        "agent_claim": "Dropout, per Srivastava et al. (2014), randomly zeroes a fraction of activations during training to reduce overfitting.",
    },
    {
        "domain": "research", "supported": False,
        "input_query": "What does dropout regularization do during training?",
        "evidence": "Srivastava et al. (2014) showed dropout randomly zeroes a fraction of unit activations during training to reduce overfitting.",
        "agent_claim": "Dropout permanently removes the weakest-performing neurons from the network architecture after each epoch.",
    },
    {
        "domain": "research", "supported": True,
        "input_query": "What normalization technique did Ioffe and Szegedy propose?",
        "evidence": "Ioffe and Szegedy (2015) proposed batch normalization, which normalizes layer inputs using mini-batch statistics.",
        "agent_claim": "Batch normalization, proposed by Ioffe and Szegedy (2015), normalizes layer inputs using statistics computed over the mini-batch.",
    },
    {
        "domain": "research", "supported": False,
        "input_query": "What normalization technique did Ioffe and Szegedy propose?",
        "evidence": "Ioffe and Szegedy (2015) proposed batch normalization, which normalizes layer inputs using mini-batch statistics.",
        "agent_claim": "Batch normalization was introduced in the original 2017 Transformer paper as a replacement for attention weights.",
    },

    # ── tech_support (supported / tool count mismatch / tool execution failure) ──
    {
        "domain": "tech_support", "tool": "kb_search", "result_count": 4, "status": "success",
        "input_query": "How many articles matched 'password reset failure'?",
        "evidence": "Queried kb_search with query 'password reset failure', returned 4 matching articles.",
        "supported_claim": "The knowledge base search returned 4 matching articles for password reset failure.",
        "mismatch_claim": "The knowledge base search returned 27 matching articles and auto-resolved the ticket.",
    },
    {
        "domain": "tech_support", "tool": "port_scan", "result_count": 3, "status": "success",
        "input_query": "How many open ports were found on host db-prod-02?",
        "evidence": "Port scan of db-prod-02 completed and found 3 open ports: 22, 443, 5432.",
        "supported_claim": "The port scan of db-prod-02 found 3 open ports (22, 443, 5432).",
        "mismatch_claim": "The port scan of db-prod-02 found 19 open ports, indicating a critical security breach.",
    },
    {
        "domain": "tech_support", "tool": "log_search", "result_count": 6, "status": "success",
        "input_query": "How many ERROR-level log lines occurred in the last hour?",
        "evidence": "Log search for level=ERROR in the last hour returned 6 matching lines.",
        "supported_claim": "6 ERROR-level log lines were found in the last hour.",
        "mismatch_claim": "148 ERROR-level log lines were found, indicating the service is down.",
    },
    {
        "domain": "tech_support", "tool": "backup_job", "status": "error", "error": "DiskQuotaExceeded",
        "input_query": "Did last night's backup job complete successfully?",
        "evidence": "Backup job failed with exit code 1: DiskQuotaExceeded on volume /backups.",
        "supported_claim": "Last night's backup job failed due to DiskQuotaExceeded on the /backups volume.",
        "failure_claim": "Last night's backup job completed successfully and all data was archived.",
    },
    {
        "domain": "tech_support", "tool": "restart_service", "status": "error", "error": "PermissionDenied",
        "input_query": "Was the nginx service restarted successfully?",
        "evidence": "restart_service for nginx failed with PermissionDenied: insufficient privileges.",
        "supported_claim": "The attempt to restart nginx failed with a PermissionDenied error.",
        "failure_claim": "The nginx service was restarted successfully and is now running normally.",
    },
    {
        "domain": "tech_support", "tool": "cert_renew", "status": "error", "error": "ACMEChallengeTimeout",
        "input_query": "Was the TLS certificate for api.internal renewed?",
        "evidence": "cert_renew for api.internal failed: ACMEChallengeTimeout after 3 retries.",
        "supported_claim": "Certificate renewal for api.internal failed with an ACME challenge timeout after 3 retries.",
        "failure_claim": "The TLS certificate for api.internal was renewed successfully and is valid for another 90 days.",
    },

    # ── data_analysis (supported / tool count mismatch) ──
    {
        "domain": "data_analysis", "tool": "sql_query", "result_count": 1204, "status": "success",
        "input_query": "How many rows matched the churned-customer query?",
        "evidence": "SQL query for churned customers in Q2 returned 1204 matching rows.",
        "supported_claim": "The churned-customer query for Q2 returned 1204 matching rows.",
        "mismatch_claim": "The churned-customer query returned 9,850 matching rows, indicating mass customer loss.",
    },
    {
        "domain": "data_analysis", "tool": "csv_load", "result_count": 512, "status": "success",
        "input_query": "How many records were loaded from the sales export?",
        "evidence": "csv_load parsed sales_export.csv and loaded 512 records successfully.",
        "supported_claim": "512 records were loaded successfully from the sales export CSV.",
        "mismatch_claim": "3,200 records were loaded from the sales export, tripling last month's volume.",
    },
    {
        "domain": "data_analysis", "tool": "aggregate_query", "result_count": 7, "status": "success",
        "input_query": "How many product categories had negative growth this quarter?",
        "evidence": "Aggregate query grouped by category returned 7 categories with negative quarter-over-quarter growth.",
        "supported_claim": "7 product categories showed negative growth this quarter.",
        "mismatch_claim": "Only 1 product category showed negative growth this quarter, the rest grew.",
    },
    {
        "domain": "data_analysis", "supported": True,
        "input_query": "What is the mean of the dataset [10, 20, 30, 40, 50]?",
        "evidence": "The five values [10, 20, 30, 40, 50] sum to 150; dividing by 5 gives a mean of 30.",
        "agent_claim": "The mean of [10, 20, 30, 40, 50] is 30, since the values sum to 150 and there are 5 of them.",
    },
    {
        "domain": "data_analysis", "supported": False,
        "input_query": "What is the mean of the dataset [10, 20, 30, 40, 50]?",
        "evidence": "The five values [10, 20, 30, 40, 50] sum to 150; dividing by 5 gives a mean of 30.",
        "agent_claim": "The mean of [10, 20, 30, 40, 50] is 45, and the standard deviation is negative.",
    },
    {
        "domain": "data_analysis", "supported": True,
        "input_query": "What does a correlation coefficient of 0 indicate?",
        "evidence": "A Pearson correlation coefficient of 0 indicates no linear relationship between the two variables.",
        "agent_claim": "A correlation coefficient of 0 means there is no linear relationship between the two variables.",
    },
    {
        "domain": "data_analysis", "supported": False,
        "input_query": "What does a correlation coefficient of 0 indicate?",
        "evidence": "A Pearson correlation coefficient of 0 indicates no linear relationship between the two variables.",
        "agent_claim": "A correlation coefficient of 0 proves that one variable directly causes changes in the other.",
    },
]


def build_case(idx: int, split: str, spec: dict) -> dict:
    domain = spec["domain"]
    case_id = f"{split}_{idx:02d}"

    if "tool" in spec:
        if spec.get("status") == "error":
            tool_records = [{"tool_name": spec["tool"], "status": "error", "error": spec["error"]}]
            claim = spec["failure_claim"] if idx % 2 == 0 else spec["supported_claim"]
            is_supported = claim == spec["supported_claim"]
        else:
            tool_records = [{"tool_name": spec["tool"], "result_count": spec["result_count"], "status": "success"}]
            claim = spec["mismatch_claim"] if idx % 2 == 0 else spec["supported_claim"]
            is_supported = claim == spec["supported_claim"]

        if is_supported:
            classification, failure_type, is_failure = "SUPPORTED", "NO_FAILURE", False
        elif spec.get("status") == "error":
            classification, failure_type, is_failure = "CONTRADICTED", "TOOL_EXECUTION_FAILURE_CLAIM", True
        else:
            classification, failure_type, is_failure = "CONTRADICTED", "TOOL_COUNT_MISMATCH", True

        return {
            "id": case_id, "domain": domain,
            "input_query": spec["input_query"], "evidence": spec["evidence"],
            "tool_records": tool_records, "agent_claim": claim,
            "expected_classification": classification,
            "expected_failure_type": failure_type, "is_failure": is_failure,
        }

    supported = spec["supported"]
    return {
        "id": case_id, "domain": domain,
        "input_query": spec["input_query"], "evidence": spec["evidence"],
        "agent_claim": spec["agent_claim"],
        "expected_classification": "SUPPORTED" if supported else "CONTRADICTED",
        "expected_failure_type": "NO_FAILURE" if supported else "GROUNDING_CONTRADICTION",
        "is_failure": not supported,
    }


def main() -> None:
    # 23 new cases, split roughly proportional to the existing 15/15/20 dev/val/test ratio.
    split_sizes = {"dev": 6, "val": 7, "test": 10}
    cursor = 0

    for split, n in split_sizes.items():
        path = DATASETS_DIR / f"v1.0_{split}.json"
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        existing_max = max(int(c["id"].rsplit("_", 1)[1]) for c in data["cases"])
        batch = NEW_CASES[cursor:cursor + n]
        cursor += n

        for i, spec in enumerate(batch):
            new_case = build_case(existing_max + i + 1, split, spec)
            data["cases"].append(new_case)

        data["total_cases"] = len(data["cases"])
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"{split}: {len(data['cases'])} cases total (+{len(batch)})")


if __name__ == "__main__":
    main()
