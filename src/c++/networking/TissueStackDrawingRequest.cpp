/*
 * This file is part of TissueStack.
 *
 * TissueStack is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * TissueStack is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with TissueStack.  If not, see <http://www.gnu.org/licenses/>.
 */
#include "networking.h"
#include "imaging.h"
#include "services.h"
#include "utils.h"
#include "database.h"

const std::string tissuestack::networking::TissueStackDrawingRequest::SERVICE = "DRAWING";

tissuestack::networking::TissueStackDrawingRequest::~TissueStackDrawingRequest()
{
}


tissuestack::networking::TissueStackDrawingRequest::TissueStackDrawingRequest(
        std::unordered_map<std::string, std::string> & request_parameters)
{
    int int_x, int_y, int_z;

    const std::string x =
        tissuestack::utils::Misc::findUnorderedMapEntryWithUpperCaseStringKey(request_parameters, "x");
    if (x.empty())
        THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
                "Mandatory parameter 'x' was not supplied!");

    try {
        int_x = std::stoi(x);
    } catch(...) {
        THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
                "Mandatory parameter 'x' was not a well formed integer");
    }

    const std::string y =
        tissuestack::utils::Misc::findUnorderedMapEntryWithUpperCaseStringKey(request_parameters, "y");
    if (y.empty())
        THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
                "Mandatory parameter 'y' was not supplied!");

    try {
        int_y = std::stoi(y);
    } catch(...) {
        THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
                "Mandatory parameter 'y' was not a well formed integer");
    }

    const std::string z =
        tissuestack::utils::Misc::findUnorderedMapEntryWithUpperCaseStringKey(request_parameters, "z");
    if (z.empty())
        THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
                "mandatory parameter 'z' was not supplied!");

    try {
        int_z = std::stoi(z);
    } catch(...) {
        THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
                "Mandatory parameter 'z' was not a well formed integer");
    }

    const std::string value =
        tissuestack::utils::Misc::findUnorderedMapEntryWithUpperCaseStringKey(request_parameters, "value");
    if (value.empty())
        THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
                "mandatory parameter 'value' was not supplied!");

	std::string dataset = tissuestack::utils::Misc::findUnorderedMapEntryWithUpperCaseStringKey(request_parameters, "dataset");
	if (dataset.empty())
		THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
			"Mandatory parameter 'dataset' was not supplied!");

    const unsigned char value_d = std::stoi(value);

    const tissuestack::imaging::TissueStackDiffPixel pixel(int_x, int_y, int_z, value_d);
    tissuestack::imaging::TissueStackRawDiff diff(pixel);


    const std::vector<const tissuestack::imaging::TissueStackImageData *> ret =
        tissuestack::database::DataSetDataProvider::queryById(strtoull(dataset.c_str(), NULL, 10)); //TODO: include planes??
    
    if (ret.empty()) {
		THROW_TS_EXCEPTION(tissuestack::common::TissueStackInvalidRequestException,
			"Invalid Dataset ID");
    } 

    const tissuestack::imaging::TissueStackImageData * imageData = ret[0];
    std::string filename = imageData->getFileName();

    new tissuestack::services::TissueStackDrawingTask(
            tissuestack::services::TissueStackTaskQueue::instance()->generateTaskId(),
            filename,
            diff);

    this->setType(tissuestack::common::Request::Type::TS_DRAWING);
}

const bool tissuestack::networking::TissueStackDrawingRequest::isObsolete() const
{
    return false;
}


const std::string tissuestack::networking::TissueStackDrawingRequest::getContent() const
{
	return std::string("TS_DRAWING");
}
