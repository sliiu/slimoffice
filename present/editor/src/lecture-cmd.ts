import {
  withLectureClick,
  withLectureFrame,
  withoutLectureCamera,
  type EditCommand,
  type Lecture,
  type LectureFrame,
  type Presentation,
} from "@ppt/core";

function cloneLecture(lecture: Lecture | undefined): Lecture | undefined {
  if (!lecture) return undefined;
  return {
    takes: lecture.takes.map((t) => ({ ...t, clicksMs: [...t.clicksMs] })),
    ...(lecture.frame ? { frame: { ...lecture.frame } } : {}),
  };
}

abstract class LectureEdit implements EditCommand {
  abstract readonly label: string;
  private prev: Lecture | undefined;
  private touched = false;

  protected abstract next(lecture: Lecture): Lecture;

  apply(pres: Presentation): void {
    if (!pres.lecture) return;
    this.prev = cloneLecture(pres.lecture);
    this.touched = true;
    pres.lecture = this.next(pres.lecture);
  }

  revert(pres: Presentation): void {
    if (!this.touched) return;
    pres.lecture = cloneLecture(this.prev);
  }
}

export class SetLectureClicksCmd extends LectureEdit {
  readonly label = "Lecture clicks";
  constructor(
    private slideId: string,
    private clickIndex: number,
    private ms: number,
  ) {
    super();
  }
  protected next(lecture: Lecture): Lecture {
    return withLectureClick(lecture, this.slideId, this.clickIndex, this.ms);
  }
}

export class SetLectureFrameCmd extends LectureEdit {
  readonly label = "Lecture frame";
  constructor(private frame: LectureFrame) {
    super();
  }
  protected next(lecture: Lecture): Lecture {
    return withLectureFrame(lecture, this.frame);
  }
}

export class ClearLectureCameraCmd extends LectureEdit {
  readonly label = "Clear lecture camera";
  constructor(private slideId: string) {
    super();
  }
  protected next(lecture: Lecture): Lecture {
    return withoutLectureCamera(lecture, this.slideId);
  }
}
