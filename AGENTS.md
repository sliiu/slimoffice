# 只按 ECMA-376 写文件

演示文稿、文档、表格的读写都以 **ECMA-376 第 5 版**（对应 ISO/IEC 29500）为准。全文在私有仓库的 `ppt-convert/docs/ecma-376-5th/`。这是硬规则，不是倾向。

## 允许

- `schemas.openxmlformats.org` 下、第 5 版 schema 里有的命名空间和元素。
- Part 4 过渡迁特性里的 VML（`urn:schemas-microsoft-com:vml`）和 `urn:schemas-microsoft-com:office:*`。写之前必须在根元素上声明对应的 `xmlns`。
- 读入时保留不认识的部件字节，原样写回。这包括宏（`vbaProject.bin` 原样保留，不解码、不执行）。

## 禁止

- 不写 `http://schemas.microsoft.com/office/…`。第 5 版里没有这一族：切换的 p14 / p15 / p159、精确毫秒时长、节、2018 批注、chartEx、3D 模型、SVG blip、SmartArt 的 dsp 绘图、切片器、迷你图、表单控件、a14 公式。
- 不实现微软的私有协议：MS-PPTX、MS-OI29500、MS-OVBA、MS-OFFCRYPTO、MS-XLS 的 BIFF。不新增 `.xls` 读取、Agile 加密解密、VBA 源码解压。已有的不再扩。
- 不使用金山 WPS、LibreOffice（`loext`、`urn:org:documentfoundation`）、OnlyOffice 或任何厂商的私有标记、扩展和未授权的实现。
- 不把标准里没有的元素名拼进去。段落和文字串的开关只能写 `wml.xsd` 白名单里的那些。

## 标准覆盖不了时

降级到标准有的最近表达，并在注释里写明丢掉了什么。例如精确时长折成 `spd` 三档，2010 以后的切换退成 `fade`，3D 模型落成预览图。

拿不定某个元素算不算标准时，先查第 5 版的 schema，不要按 Office 实际写出来的文件反推。
