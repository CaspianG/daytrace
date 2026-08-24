"""Reproduce Daytrace's int8 semantic encoder from the pinned STS ONNX model."""

from __future__ import annotations

import argparse
import hashlib
import pathlib
import tempfile

import onnx
from onnxruntime.quantization import QuantType, quantize_dynamic


SOURCE_SHA256 = "566efbbd349b2d882a3dd03bce12c4b88a799fce2e7255dba5f0af7f4b4eb302"
EXPECTED_OUTPUT = "last_hidden_state"


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()

    if sha256(args.source) != SOURCE_SHA256:
        raise SystemExit("Pinned rubert-tiny-sts ONNX checksum mismatch")
    source_model = onnx.load(args.source)
    if [item.name for item in source_model.graph.output] != [EXPECTED_OUTPUT]:
        raise SystemExit("Pinned semantic model has unexpected outputs")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="daytrace-semantic-") as temporary:
        quantized = pathlib.Path(temporary) / "model_quantized.onnx"
        quantize_dynamic(str(args.source), str(quantized), weight_type=QuantType.QInt8)
        converted = onnx.load(quantized)
        onnx.checker.check_model(converted)
        if [item.name for item in converted.graph.output] != [EXPECTED_OUTPUT]:
            raise SystemExit("Quantized semantic model has unexpected outputs")
        quantized.replace(args.output)

    print(f"created={args.output} bytes={args.output.stat().st_size} sha256={sha256(args.output)}")


if __name__ == "__main__":
    main()
