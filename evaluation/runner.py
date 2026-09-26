
"""AgentGuard evaluation runner.

Start by loading the team's shared test cases.
Later, connect this to A1's run_scenario().
"""

from contract import CASES


def main():
    print("=" * 55)
    print("AGENTGUARD — EVALUATION")
    print("=" * 55)

    print(f"\nLoaded {len(CASES)} test scenarios.\n")

    for case in CASES:
        print(f"ID:       {case['id']}")
        print(f"Title:    {case['title']}")
        print(f"Type:     {case['kind']}")
        print(f"Expected: {case['expect']}")
        print("-" * 55)


if __name__ == "__main__":
    main()
