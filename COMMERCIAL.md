# 商业授权

公开包的开源许可证是 AGPL-3.0-or-later，版权人是 Sliiu Inc。闭源嵌入需要商业授权，联系 support@slimppt.com。上海轻柚信息科技有限公司不签这份合同。

合同只覆盖 SlimPPT 自有代码。Sliiu Inc 一侧签名，不用公章：

```
Sliiu Inc
By: [签名]
Name: [姓名]
Title: [CEO 或 President]
Date: [日期]
```

下面这些不在合同里：

- 网关、控制台、运营后台、网站壳、协作客户端
- `@ffmpeg/core@0.12.6`。编辑器导出 MP4 时从 unpkg 加载这份 WebAssembly。npm 元数据写着 MIT，二进制里有 x264、x265 和 LAME，按 GPL-2.0-or-later。闭源产品带上这段转码，就要按 GPL 提供对应源码
- 第三方库。它们继续按 `THIRD-PARTY-NOTICES.md` 里的许可证走，不能改成这份合同
