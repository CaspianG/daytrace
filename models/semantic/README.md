# Daytrace semantic model assets

Daytrace uses the MIT-licensed [`rubert-tiny-sts`](https://huggingface.co/sergeyzh/rubert-tiny-sts) sentence encoder, based on [`cointegrated/rubert-tiny2`](https://huggingface.co/cointegrated/rubert-tiny2). The pinned feature-extraction source is [`VadimHursevich/rubert-tiny-sts-onnx`](https://huggingface.co/VadimHursevich/rubert-tiny-sts-onnx/tree/aa746aec6111926177bf194109783ae61b438b60).

`onnx/model_quantized.onnx` is a deterministic dynamic-int8 conversion of that graph. `scripts/build-semantic-model.py` verifies the upstream SHA-256 before conversion and validates the resulting ONNX graph. It does not retrain the encoder.

The model is optional. Daytrace downloads about 32 MB only after the user selects semantic analysis, runs it with one CPU thread in a short-lived Web Worker, and never sends activity metadata to the model host.
