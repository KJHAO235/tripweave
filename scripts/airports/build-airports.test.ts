import { expect, test } from 'vitest'
import { cityName, parseCsv, selectAirports } from './build-airports.ts'

const HEADER = '"id","ident","type","name","latitude_deg","longitude_deg","municipality","scheduled_service","iata_code"'

test('引號內含逗號、跳脫的雙引號與換行都正確解析', () => {
  expect(parseCsv('a,"b, c","d ""e""",f\r\n1,2,3,4\n')).toEqual([
    ['a', 'b, c', 'd "e"', 'f'],
    ['1', '2', '3', '4'],
  ])
})

test('城市名稱去掉括號內的補充，沒有城市時用機場名稱', () => {
  expect(cityName('Manila (Pasay)', 'Ninoy Aquino International Airport')).toBe('Manila')
  expect(cityName('', 'Some Airport')).toBe('Some Airport')
})

test('只保留有定期航班、有 IATA 代碼的機場，座標取 4 位小數', () => {
  const csv = [
    HEADER,
    '1,"RPLL","large_airport","Ninoy Aquino International Airport",14.508600123,121.019997,"Manila (Pasay)","yes","MNL"',
    '2,"X1","small_airport","No Service",10,120,"Town","no","NOS"',
    '3,"X2","medium_airport","No Code",10,120,"Town","yes",""',
    '4,"X3","heliport","Heli",10,120,"Town","yes","HEL"',
    '5,"RPSD","small_airport","El Nido Airport",11.202399,119.416087,"El Nido","yes","ENI"',
  ].join('\n')
  expect(selectAirports(csv)).toEqual([
    ['ENI', 'El Nido Airport', 'El Nido', 11.2024, 119.4161],
    ['MNL', 'Ninoy Aquino International Airport', 'Manila', 14.5086, 121.02],
  ])
})
