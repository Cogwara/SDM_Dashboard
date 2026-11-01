"""
Authoritative Regional Executive Directory for IHS Nigeria & MTN Operations.
Provides fallback contacts for Head, Field Service, Customer Experience Manager (CEM),
and RPM (MS Site) / RTO across all 36 states and the FCT.
"""

STATE_EXECUTIVE_MAP = {
    'FCT': {
        'head': ('Oga Ian Akwe', '09062072247', 'ian.akwe@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Angbarity Amwe', '09037755972', 'ayuba.amwe@ihstowers.com'),
    },
    'ABUJA': {
        'head': ('Oga Ian Akwe', '09062072247', 'ian.akwe@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Bilal Mohammed', '09139334536', 'bilal.mohammed@ihstowers.com'),
    },
    'KADUNA': {
        'head': ('Oga Ian Akwe', '09062072247', 'ian.akwe@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Endurance Ogbuigwe', '09169980530', 'endurance.ogbuigwe@ihstowers.com'),
    },
    'NIGER': {
        'head': ('Oga Ian Akwe', '09062072247', 'ian.akwe@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Jinadu Blessing Anuoluwapo', '09062424054', 'blessing.jinadu@ihstowers.com'),
    },
    'NASARAWA': {
        'head': ('Oga Ian Akwe', '09062072247', 'ian.akwe@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Joseph Clement', '09169838879', 'joseph.clement@ihstowers.com'),
    },
    'NASSARAWA': {
        'head': ('Oga Ian Akwe', '09062072247', 'ian.akwe@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Joseph Clement', '09169838879', 'joseph.clement@ihstowers.com'),
    },
    'PLATEAU': {
        'head': ('Grace Audu', '09062424098', 'grace.audu@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Elofu Idegwu', '09062738601', 'elofu.idegwu@ihstowers.com'),
    },
    'BAUCHI': {
        'head': ('Grace Audu', '09062424098', 'grace.audu@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Umar Hassan', '09169838028', 'umar.hassan@ihstowers.com'),
    },
    'GOMBE': {
        'head': ('Grace Audu', '09062424098', 'grace.audu@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Umar Hassan', '09169838028', 'umar.hassan@ihstowers.com'),
    },
    'KOGI': {
        'head': ('Abiodun Samuel', '09062534503', 'abiodun.samuel@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Taofeek Lawal', '09062072130', 'taofeek.lawal@ihstowers.com'),
    },
    'BENUE': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'TARABA': {
        'head': ('Grace Audu', '09062424098', 'grace.audu@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Ismail Musa', '09169838883', 'ismail.musa@ihstowers.com'),
    },
    'ADAMAWA': {
        'head': ('Grace Audu', '09062424098', 'grace.audu@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Ismail Musa', '09169838883', 'ismail.musa@ihstowers.com'),
    },
    'BORNO': {
        'head': ('Grace Audu', '09062424098', 'grace.audu@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Umar Hassan', '09169838028', 'umar.hassan@ihstowers.com'),
    },
    'YOBE': {
        'head': ('Grace Audu', '09062424098', 'grace.audu@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Umar Hassan', '09169838028', 'umar.hassan@ihstowers.com'),
    },
    'KWARA': {
        'head': ('Abiodun Samuel', '09062534503', 'abiodun.samuel@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Taofeek Lawal', '09062072130', 'taofeek.lawal@ihstowers.com'),
    },
    'KANO': {
        'head': ('Ali Muhammad Kwairanga', '09062072124', 'Ali.Muhammad@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Isaac Solomon Kama', '09062998195', 'isaac.kama@ihstowers.com'),
    },
    'JIGAWA': {
        'head': ('Ali Muhammad Kwairanga', '09062072124', 'Ali.Muhammad@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Isaac Solomon Kama', '09062998195', 'isaac.kama@ihstowers.com'),
    },
    'KATSINA': {
        'head': ('Ali Muhammad Kwairanga', '09062072124', 'Ali.Muhammad@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Isaac Solomon Kama', '09062998195', 'isaac.kama@ihstowers.com'),
    },
    'SOKOTO': {
        'head': ('Ali Muhammad Kwairanga', '09062072124', 'Ali.Muhammad@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Mustapha Salihu', '09169838891', 'mustapha.salihu@ihstowers.com'),
    },
    'KEBBI': {
        'head': ('Ali Muhammad Kwairanga', '09062072124', 'Ali.Muhammad@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Mustapha Salihu', '09169838891', 'mustapha.salihu@ihstowers.com'),
    },
    'ZAMFARA': {
        'head': ('Ali Muhammad Kwairanga', '09062072124', 'Ali.Muhammad@ihstowers.com'),
        'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
        'rto': ('Mustapha Salihu', '09169838891', 'mustapha.salihu@ihstowers.com'),
    },
    'LAGOS': {
        'head': ('Abdulrahman Seyi Adegoke', '07015822612', 'adegoke.abdul@ihstowers.com'),
        'cem': ('Chimezie Anozie', '09062998168', 'chimezie.anozie@ihstowers.com'),
        'rto': ('Mofoluso Ogunseye', '09062072144', 'mofoluso.ogunseye@ihstowers.com'),
    },
    'OGUN': {
        'head': ('Abdulrahman Seyi Adegoke', '07015822612', 'adegoke.abdul@ihstowers.com'),
        'cem': ('Chimezie Anozie', '09062998168', 'chimezie.anozie@ihstowers.com'),
        'rto': ('Ibrahim Yekini', '09062072400', 'ibrahim.yekini@ihstowers.com'),
    },
    'OYO': {
        'head': ('Abdulrahman Seyi Adegoke', '07015822612', 'adegoke.abdul@ihstowers.com'),
        'cem': ('Chimezie Anozie', '09062998168', 'chimezie.anozie@ihstowers.com'),
        'rto': ('Ibrahim Yekini', '09062072400', 'ibrahim.yekini@ihstowers.com'),
    },
    'OSUN': {
        'head': ('Abdulrahman Seyi Adegoke', '07015822612', 'adegoke.abdul@ihstowers.com'),
        'cem': ('Chimezie Anozie', '09062998168', 'chimezie.anozie@ihstowers.com'),
        'rto': ('Ibrahim Yekini', '09062072400', 'ibrahim.yekini@ihstowers.com'),
    },
    'ONDO': {
        'head': ('Abdulrahman Seyi Adegoke', '07015822612', 'adegoke.abdul@ihstowers.com'),
        'cem': ('Chimezie Anozie', '09062998168', 'chimezie.anozie@ihstowers.com'),
        'rto': ('Ibrahim Yekini', '09062072400', 'ibrahim.yekini@ihstowers.com'),
    },
    'EKITI': {
        'head': ('Abdulrahman Seyi Adegoke', '07015822612', 'adegoke.abdul@ihstowers.com'),
        'cem': ('Chimezie Anozie', '09062998168', 'chimezie.anozie@ihstowers.com'),
        'rto': ('Ibrahim Yekini', '09062072400', 'ibrahim.yekini@ihstowers.com'),
    },
    'EDO': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'DELTA': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'RIVERS': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'BAYELSA': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'CROSS RIVER': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'AKWA IBOM': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'ENUGU': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'ANAMBRA': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'IMO': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'ABIA': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
    'EBONYI': {
        'head': ('Sunny-Star Ikhanoba', '09062072220', 'sunny-star.ikhanoba@ihstowers.com'),
        'cem': ('Abiola Adeleke', '09062838811', 'abiola.adeleke@ihstowers.com'),
        'rto': ('Eigege Junior Eigege', '09169854918', 'junior.eigege@ihstowers.com'),
    },
}

DEFAULT_EXEC = {
    'head': ('Oga Ian Akwe', '09062072247', 'ian.akwe@ihstowers.com'),
    'cem': ('Nnamdi Etoamaihe', '07031783857', 'nnamdi.etoamaihe1@ihstowers.onmicrosoft.com'),
    'rto': ('Angbarity Amwe', '09037755972', 'ayuba.amwe@ihstowers.com'),
}
