"""Single AP deadline policy; shared by admission and accounting."""
TASK_DEADLINE_MAX = 7200
# Whole accounting tick, including registration/prepare/consumer/finalization.
USAGE_BYTE_LIMIT = 32 * 1024 * 1024
