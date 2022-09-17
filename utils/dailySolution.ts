import {solutionList} from "./solutionList";

export interface ISolution {
    solution: string
}

export function dailySolution(guessDate: string): ISolution  {
    const todaysSolution: string[][] = solutionList.filter(dateGuessTuple => dateGuessTuple[0] === guessDate);
    const solutionObject: ISolution = {solution: todaysSolution[0][1]}
    return solutionObject;
}