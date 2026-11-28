"""The engine CI must catch an invalid daily workflow even when no Actions job can start."""
from pathlib import Path
import subprocess

import yaml


def test_daily_workflow_yaml_and_shell_syntax():
    path = Path(__file__).resolve().parents[2] / ".github/workflows/daily.yml"
    workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
    triggers = workflow["on"]
    assert triggers["schedule"] and "workflow_dispatch" in triggers
    steps = workflow["jobs"]["engine"]["steps"]
    for step in steps:
        if "run" in step and step.get("shell", "bash") == "bash":
            subprocess.run(["bash", "-n"], input=step["run"], text=True, check=True)
