"""Сверка ядра игры с моделью баланса.

Берёт planning/balance/sim.py, подменяет генератор случайных чисел на тот же mulberry32,
что и в src/sim/rng.ts, прогоняет все стратегии и пишет src/sim/fixtures/model-parity.json.
Тест src/sim/parity.test.ts требует, чтобы игра повторила эти прогоны до 1 баблоса.

Запуск: python3 scripts/model-parity.py путь/к/sim.py
"""
import importlib.util, json, os, sys

SEEDS = 10
DAYS = 168
NAMES = {"Копеечкино": "kopeechkino", "Нижние Барыши": "barysh"}


class Mulberry:
    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def random(self):
        self.s = (self.s + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.s
        imul = lambda a, b: (a * b) & 0xFFFFFFFF
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296


def main(path):
    spec = importlib.util.spec_from_file_location("balance_sim", path)
    sim = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sim)
    sim.NICHES["store"]["cogs"] = 252  # в модели 0.72 * 350 = 251.99999999999997
    sim.random.Random = Mulberry       # run() создаёт генератор через random.Random(seed)
    out = {}
    for key in ("passive", "smart", "mix", "econ", "greedy", "premium"):
        runs = []
        for seed in range(SEEDS):
            r = sim.run(sim.STRATS[key], days=DAYS, seed=seed)
            runs.append(dict(captured={NAMES[k]: v for k, v in r["captured"].items()},
                             cash=[r["cash"][d] for d in (13, 55, 111, DAYS - 1)]))
        out[key] = runs
    dst = os.path.join(os.path.dirname(__file__), "..", "src", "sim", "fixtures", "model-parity.json")
    with open(dst, "w") as f:
        rows = [f'  "{k}": [\n' + ",\n".join("    " + json.dumps(r, ensure_ascii=False) for r in v) + "\n  ]"
                for k, v in out.items()]
        f.write("{\n" + ",\n".join(rows) + "\n}\n")
    print("written", os.path.normpath(dst))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../planning/balance/sim.py")
