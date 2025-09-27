"""
ANSI Color Codes Utility

Provides color constants for terminal output formatting.
"""

CSI = '\033['

class Colors:
    RED = CSI + '91m'
    GREEN = CSI + '92m'
    BLUE = CSI + '94m'
    YELLOW = CSI + '93m'
    RESET = CSI + '0m'
    BOLD = CSI + '1m'
