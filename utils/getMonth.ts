export function getMonth(): string {
    const fullDate = new Date();
    let month = `${fullDate.getMonth() + 1}`;
    if (month.length === 1) {
      month = "0" + month;
    }
    const year = fullDate.getFullYear();
    return `${month}-${year}`;
  }
  