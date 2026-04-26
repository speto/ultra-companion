export interface SegmentControlVisibility {
  showLeftControls: boolean;
  showRemove: boolean;
  showChevron: boolean;
}

export function getSegmentControlVisibility(isEditing: boolean): SegmentControlVisibility {
  return {
    showLeftControls: isEditing,
    showRemove: isEditing,
    showChevron: !isEditing,
  };
}
